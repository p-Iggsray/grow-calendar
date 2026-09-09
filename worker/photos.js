// Journal photos: pictures attached to a day's journal page.
//
// The row lives in D1 and the pixels live in R2 - see worker/photoStore.js for
// why, and for how a row written before that split still reads. Nothing here
// ever returns image bytes inside JSON any more; a photo travels as a URL and
// the browser fetches it like any other image, which is what lets it lazy-load,
// cache, and skip what never scrolls into view.
import { json, error, nowIso, safeJsonBounded, base64ToBytes } from "./util.js";
import { ownedGrowRow } from "./plants.js";
import { logError } from "./log.js";
import {
  putPhotoPair, getPhotoObject, deletePhotoObjects, photoUrl, hasPhotoStore,
} from "./photoStore.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// ~700KB of binary per photo, ~60KB per thumbnail (base64 inflates by 4/3).
// Kept safely under D1's ~1MB bound-parameter ceiling.
const MAX_DATA_CHARS = 980_000;
const MAX_THUMB_CHARS = 80_000;
// A day's shoot is a whole set of plants, so the cap has to be big enough for
// one library pick to land in full - it matches MAX_BATCH on the client. Day
// reads only pull thumbnails, which are capped at 80k chars each.
const MAX_PER_DAY = 20;
const MAX_PER_GROW = 800;

let _schemaReady = false;
export async function ensureJournalPhotosSchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS journal_photos (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      grow_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      plant_id   TEXT,
      from_camera INTEGER NOT NULL DEFAULT 0,
      data       TEXT NOT NULL,
      thumb      TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
  // Tables created before these columns existed self-heal them.
  try { await env.DB.prepare("ALTER TABLE journal_photos ADD COLUMN plant_id TEXT").run(); } catch { /* exists */ }
  try { await env.DB.prepare("ALTER TABLE journal_photos ADD COLUMN from_camera INTEGER NOT NULL DEFAULT 0").run(); } catch { /* exists */ }
  // Where the bytes are, once they are in R2. Null means this row predates the
  // move and still carries its base64 in `data`/`thumb`.
  //
  // ADD COLUMN is metadata only, which matters here: rebuilding this table to
  // make the blob columns nullable would mean copying hundreds of megabytes of
  // base64 through D1, and that is exactly the operation this whole change
  // exists to avoid. So `data` and `thumb` stay NOT NULL and an R2-backed row
  // writes the empty string into them. Nothing ever reads those columns when
  // there is a key.
  try { await env.DB.prepare("ALTER TABLE journal_photos ADD COLUMN data_key TEXT").run(); } catch { /* exists */ }
  try { await env.DB.prepare("ALTER TABLE journal_photos ADD COLUMN thumb_key TEXT").run(); } catch { /* exists */ }
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_journal_photos_day ON journal_photos (grow_id, date)"
  ).run();
  _schemaReady = true;
}

function newPhotoId() {
  return "ph" + crypto.randomUUID().replaceAll("-", "").slice(0, 14);
}

// Pure: validate an upload payload. Returns { ok:true } or { ok:false, message }.
export function validatePhotoInput(body) {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return { ok: false, message: "date must be YYYY-MM-DD" };
  }
  if (typeof body.data !== "string" || !DATA_URL_RE.test(body.data)) {
    return { ok: false, message: "data must be a base64 image data URL (jpeg, png, or webp)" };
  }
  if (body.data.length > MAX_DATA_CHARS) {
    return { ok: false, message: "that photo is too large even after compressing - try a cropped version" };
  }
  if (typeof body.thumb !== "string" || !DATA_URL_RE.test(body.thumb)) {
    return { ok: false, message: "thumb must be a base64 image data URL" };
  }
  if (body.thumb.length > MAX_THUMB_CHARS) {
    return { ok: false, message: "thumbnail is too large" };
  }
  if (body.plantId !== undefined && body.plantId !== null) {
    if (typeof body.plantId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.plantId)) {
      return { ok: false, message: "invalid plantId" };
    }
  }
  if (body.fromCamera !== undefined && typeof body.fromCamera !== "boolean") {
    return { ok: false, message: "fromCamera must be true or false" };
  }
  return { ok: true };
}

// POST /api/grows/:id/photos  {date, data, thumb, plantId?}
export async function createJournalPhoto(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const p = await safeJsonBounded(request, MAX_DATA_CHARS + MAX_THUMB_CHARS + 4096);
  if (!p.ok) return error(p.status, p.error);
  const v = validatePhotoInput(p.data);
  if (!v.ok) return error(400, v.message);

  // A plant photo must point at a real plant of THIS grow.
  let plantId = p.data.plantId ?? null;
  if (plantId) {
    let survey = null;
    try { survey = row.survey ? JSON.parse(row.survey) : null; } catch { survey = null; }
    const exists = Array.isArray(survey?.strains) && survey.strains.some((s) => s.id === plantId);
    if (!exists) return error(404, "plant not found");
  }
  await ensureJournalPhotosSchema(env);

  const [dayRow, growRow] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM journal_photos WHERE grow_id = ? AND date = ?")
      .bind(growId, p.data.date).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM journal_photos WHERE grow_id = ?")
      .bind(growId).first(),
  ]);
  if ((dayRow?.n ?? 0) >= MAX_PER_DAY) return error(400, `a day holds at most ${MAX_PER_DAY} photos`);
  if ((growRow?.n ?? 0) >= MAX_PER_GROW) return error(400, "photo limit reached for this grow");

  const id = newPhotoId();
  // A shot taken in the app is not in the phone's camera roll yet; the viewer
  // uses this to offer a one-tap save.
  const fromCamera = p.data.fromCamera === true ? 1 : 0;

  // Bytes to the bucket first, row second. Done this way round a failure
  // leaves an orphaned object, which costs nothing and can be swept; done the
  // other way round it would leave a row pointing at a picture that is not
  // there, which is a broken tile in the journal forever.
  //
  // A null here is not a failure. It means there is no bucket bound yet, or R2
  // would not take it, and the photo goes into D1 the way it always did rather
  // than not being saved at all.
  const stored = await putPhotoPair(env, user.id, id, { data: p.data.data, thumb: p.data.thumb });

  try {
    await env.DB.prepare(
      "INSERT INTO journal_photos (id, user_id, grow_id, date, plant_id, from_camera, data, thumb, data_key, thumb_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id, user.id, growId, p.data.date, plantId, fromCamera,
      stored ? "" : p.data.data,
      stored ? "" : p.data.thumb,
      stored?.dataKey ?? null,
      stored?.thumbKey ?? null,
      nowIso(),
    ).run();
  } catch (err) {
    if (stored) await deletePhotoObjects(env, [stored.dataKey, stored.thumbKey]);
    logError("photo-create-failed", { message: String(err?.message) });
    return error(500, "could not save the photo");
  }
  return json({
    photo: { id, date: p.data.date, thumb: photoUrl(id, "thumb"), plantId, fromCamera: fromCamera === 1 },
  });
}

// There used to be a GET /api/grows/:id/photos/:photoId here that answered with
// the picture itself, base64 inside JSON: ~700KB of text decoded on the main
// thread every time the viewer opened a photo, and a round trip before the
// image could even start loading. A photo id names one picture forever, so its
// address is derivable and there was nothing left to ask. The viewer builds the
// URL and the <img> does the rest.

// GET /api/photos/:photoId/(thumb|full) - the picture itself, as an image.
//
// Everywhere else a photo travels inside JSON as a data URL, which is right
// when the day's photos arrive with the day. It is wrong for a screen that
// lists sixty strains: the browser cannot lazily skip what it has already been
// handed, and it cannot cache it either. Served as real bytes, an <img> fetches
// only what scrolls into view and never asks twice, because a photo id names
// one picture that will never change.
const DATA_URL_PREFIX = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s;

// Private, because it is the owner's picture and no shared cache should ever
// hold it. Immutable, because the id will never name anything else.
const IMAGE_CACHE = "private, max-age=31536000, immutable";

export async function getPhotoImage(env, user, photoId, size) {
  await ensureJournalPhotosSchema(env);
  const full = size === "full";
  const keyColumn = full ? "data_key" : "thumb_key";

  // Ownership is checked here, in D1, before R2 is touched at all. The object
  // key is derived from ids and is not a secret; this row lookup is the only
  // thing standing between an account and someone else's picture.
  const row = await env.DB.prepare(
    `SELECT ${keyColumn} AS okey FROM journal_photos WHERE id = ? AND user_id = ?`
  ).bind(photoId, user.id).first();
  if (!row) return error(404, "photo not found");

  if (row.okey) {
    const object = await getPhotoObject(env, row.okey);
    // A key with nothing behind it means the row and the bucket disagree, and
    // guessing is worse than saying so. The blob columns are empty for these
    // rows, so there is nothing to fall back to.
    if (!object) {
      logError("photo-object-missing", { key: String(row.okey) });
      return error(404, "photo not found");
    }
    // The R2 body goes into the Response untouched, so the picture is never
    // held in worker memory at any size.
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "image/jpeg",
        "content-length": String(object.size),
        "cache-control": IMAGE_CACHE,
        "x-content-type-options": "nosniff",
      },
    });
  }

  // No key: a row written before the move, still carrying its own base64.
  // Fetched separately so the common path above never pulls a blob it will not
  // use.
  const legacy = await env.DB.prepare(
    `SELECT ${full ? "data" : "thumb"} AS url FROM journal_photos WHERE id = ? AND user_id = ?`
  ).bind(photoId, user.id).first();
  if (!legacy?.url) return error(404, "photo not found");

  const m = DATA_URL_PREFIX.exec(legacy.url);
  if (!m) return error(500, "that photo is not stored as an image");
  let bytes;
  try { bytes = base64ToBytes(m[2]); }
  catch { return error(500, "that photo could not be decoded"); }

  return new Response(bytes, {
    headers: {
      "content-type": m[1],
      "content-length": String(bytes.length),
      "cache-control": IMAGE_CACHE,
      "x-content-type-options": "nosniff",
    },
  });
}

// DELETE /api/grows/:id/photos/:photoId
export async function deleteJournalPhoto(env, user, growId, photoId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureJournalPhotosSchema(env);
  // Read the keys before the row goes, or there is nothing left to say which
  // objects belonged to it.
  const keys = await env.DB.prepare(
    "SELECT data_key, thumb_key FROM journal_photos WHERE id = ? AND grow_id = ? AND user_id = ?"
  ).bind(photoId, growId, user.id).first();
  const { meta } = await env.DB.prepare(
    "DELETE FROM journal_photos WHERE id = ? AND grow_id = ? AND user_id = ?"
  ).bind(photoId, growId, user.id).run();
  if (!meta.changes) return error(404, "photo not found");
  await deletePhotoObjects(env, [keys?.data_key, keys?.thumb_key]);
  return json({ ok: true });
}

// Thumbnails for one day - folded into the journal day payload. Plant photos
// ride along tagged with their plant.
//
// `thumb` is an address, not an image. The day payload used to carry up to 20
// base64 thumbnails, which the browser had to receive and decode in full before
// it could show the first one; now it carries 20 short strings and the grid
// loads what is on screen.
export async function photosForDay(env, userId, growId, date) {
  await ensureJournalPhotosSchema(env);
  const res = await env.DB.prepare(
    "SELECT id, date, plant_id, from_camera FROM journal_photos WHERE user_id = ? AND grow_id = ? AND date = ? ORDER BY created_at"
  ).bind(userId, growId, date).all();
  return (res.results ?? []).map(r => ({
    id: r.id, date: r.date, thumb: photoUrl(r.id, "thumb"),
    plantId: r.plant_id ?? null, fromCamera: r.from_camera === 1,
  }));
}

// GET /api/grows/:id/plants/:plantId/photos - one plant's photo timeline,
// newest first.
export async function listPlantPhotos(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureJournalPhotosSchema(env);
  const res = await env.DB.prepare(
    "SELECT id, date, from_camera FROM journal_photos WHERE user_id = ? AND grow_id = ? AND plant_id = ? ORDER BY date DESC, created_at DESC"
  ).bind(user.id, growId, plantId).all();
  return json({ photos: (res.results ?? []).map(r => ({
    id: r.id, date: r.date, thumb: photoUrl(r.id, "thumb"), fromCamera: r.from_camera === 1,
  })) });
}

// ── Moving the old rows ──────────────────────────────────────────────────────
//
// POST /api/photos/backfill - move one batch of this account's photos out of
// D1 and into the bucket, and say how many are left.
//
// It runs as an endpoint rather than a script because this is the one job that
// needs both bindings at once, and a worker already has them. Driving it from
// outside would mean pulling every picture down over the wire and pushing it
// back up, for no reason.
//
// A batch is small on purpose. Each row carries the better part of a megabyte
// of base64, so a handful at a time keeps a flat memory ceiling however many
// photos there turn out to be, and the caller loops until `remaining` is zero.
// Interrupting it is safe: rows already moved have keys and are not selected
// again, so a re-run picks up exactly where it stopped.
const BACKFILL_BATCH = 5;

export async function backfillPhotosToR2(env, user) {
  if (!hasPhotoStore(env)) return error(503, "no photo bucket is bound to this worker");
  await ensureJournalPhotosSchema(env);

  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM journal_photos WHERE user_id = ? AND data_key IS NULL"
  ).bind(user.id).first();
  const before = pending?.n ?? 0;
  if (!before) return json({ moved: 0, failed: 0, remaining: 0, done: true });

  const batch = await env.DB.prepare(
    "SELECT id, data, thumb FROM journal_photos WHERE user_id = ? AND data_key IS NULL ORDER BY rowid LIMIT ?"
  ).bind(user.id, BACKFILL_BATCH).all();

  let moved = 0;
  let failed = 0;
  for (const row of batch.results ?? []) {
    const stored = await putPhotoPair(env, user.id, row.id, { data: row.data, thumb: row.thumb });
    if (!stored) {
      // A row whose base64 will not decode is not a reason to stop the run, but
      // it must be visible, or the loop below would spin on it forever.
      failed++;
      logError("photo-backfill-failed", { id: String(row.id) });
      continue;
    }
    // Keys and blanks in one statement. Anything that reads this row between
    // the two would otherwise see a photo with neither.
    await env.DB.prepare(
      "UPDATE journal_photos SET data = '', thumb = '', data_key = ?, thumb_key = ? WHERE id = ? AND user_id = ?"
    ).bind(stored.dataKey, stored.thumbKey, row.id, user.id).run();
    moved++;
  }

  const remaining = before - moved;
  // `stuck` says the batch moved nothing while rows are still waiting, which is
  // the only state the caller must not keep retrying.
  return json({ moved, failed, remaining, done: remaining === 0, stuck: moved === 0 && remaining > 0 });
}

// date -> count map for a month (journal month index + timeline chips).
export async function photoCountsForMonth(env, userId, growId, month) {
  if (!MONTH_RE.test(month || "")) return {};
  await ensureJournalPhotosSchema(env);
  const res = await env.DB.prepare(
    "SELECT date, COUNT(*) AS n FROM journal_photos WHERE user_id = ? AND grow_id = ? AND date LIKE ? GROUP BY date"
  ).bind(userId, growId, month + "-%").all();
  return Object.fromEntries((res.results ?? []).map(r => [r.date, r.n]));
}

// date -> count for an arbitrary set of dates (timeline pages).
export async function photoCountsForDates(env, userId, growId, dates) {
  if (!dates?.length) return {};
  await ensureJournalPhotosSchema(env);
  const placeholders = dates.map(() => "?").join(",");
  const res = await env.DB.prepare(
    `SELECT date, COUNT(*) AS n FROM journal_photos WHERE user_id = ? AND grow_id = ? AND date IN (${placeholders}) GROUP BY date`
  ).bind(userId, growId, ...dates).all();
  return Object.fromEntries((res.results ?? []).map(r => [r.date, r.n]));
}
