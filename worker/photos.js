// Journal photos: pictures attached to a day's journal page. Stored in D1 as
// data URLs (the client downscales before upload - see src/lib/photos.js),
// with a small thumbnail column so month/day reads never pull full images.
import { json, error, nowIso, safeJsonBounded, base64ToBytes } from "./util.js";
import { ownedGrowRow } from "./plants.js";
import { logError } from "./log.js";

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
  try {
    await env.DB.prepare(
      "INSERT INTO journal_photos (id, user_id, grow_id, date, plant_id, from_camera, data, thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.id, growId, p.data.date, plantId, fromCamera, p.data.data, p.data.thumb, nowIso()).run();
  } catch (err) {
    logError("photo-create-failed", { message: String(err?.message) });
    return error(500, "could not save the photo");
  }
  return json({ photo: { id, date: p.data.date, thumb: p.data.thumb, plantId, fromCamera: fromCamera === 1 } });
}

// GET /api/grows/:id/photos/:photoId - the full-size image, fetched only when
// the viewer opens it.
export async function getJournalPhoto(env, user, growId, photoId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureJournalPhotosSchema(env);
  const photo = await env.DB.prepare(
    "SELECT id, date, data FROM journal_photos WHERE id = ? AND grow_id = ? AND user_id = ?"
  ).bind(photoId, growId, user.id).first();
  if (!photo) return error(404, "photo not found");
  return json({ photo });
}

// GET /api/photos/:photoId/(thumb|full) - the picture itself, as an image.
//
// Everywhere else a photo travels inside JSON as a data URL, which is right
// when the day's photos arrive with the day. It is wrong for a screen that
// lists sixty strains: the browser cannot lazily skip what it has already been
// handed, and it cannot cache it either. Served as real bytes, an <img> fetches
// only what scrolls into view and never asks twice, because a photo id names
// one picture that will never change.
const DATA_URL_PREFIX = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s;

export async function getPhotoImage(env, user, photoId, size) {
  await ensureJournalPhotosSchema(env);
  const column = size === "full" ? "data" : "thumb";
  const row = await env.DB.prepare(
    `SELECT ${column} AS url FROM journal_photos WHERE id = ? AND user_id = ?`
  ).bind(photoId, user.id).first();
  if (!row?.url) return error(404, "photo not found");

  const m = DATA_URL_PREFIX.exec(row.url);
  if (!m) return error(500, "that photo is not stored as an image");
  let bytes;
  try { bytes = base64ToBytes(m[2]); }
  catch { return error(500, "that photo could not be decoded"); }

  return new Response(bytes, {
    headers: {
      "content-type": m[1],
      "content-length": String(bytes.length),
      // Private, because it is the owner's picture and no shared cache should
      // ever hold it. Immutable, because the id will never name anything else.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

// DELETE /api/grows/:id/photos/:photoId
export async function deleteJournalPhoto(env, user, growId, photoId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureJournalPhotosSchema(env);
  const { meta } = await env.DB.prepare(
    "DELETE FROM journal_photos WHERE id = ? AND grow_id = ? AND user_id = ?"
  ).bind(photoId, growId, user.id).run();
  if (!meta.changes) return error(404, "photo not found");
  return json({ ok: true });
}

// Thumbnails for one day - folded into the journal day payload. Plant photos
// ride along tagged with their plant.
export async function photosForDay(env, userId, growId, date) {
  await ensureJournalPhotosSchema(env);
  const res = await env.DB.prepare(
    "SELECT id, date, thumb, plant_id, from_camera FROM journal_photos WHERE user_id = ? AND grow_id = ? AND date = ? ORDER BY created_at"
  ).bind(userId, growId, date).all();
  return (res.results ?? []).map(r => ({
    id: r.id, date: r.date, thumb: r.thumb,
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
    "SELECT id, date, thumb, from_camera FROM journal_photos WHERE user_id = ? AND grow_id = ? AND plant_id = ? ORDER BY date DESC, created_at DESC"
  ).bind(user.id, growId, plantId).all();
  return json({ photos: (res.results ?? []).map(r => ({
    id: r.id, date: r.date, thumb: r.thumb, fromCamera: r.from_camera === 1,
  })) });
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


// ── What MJ is allowed to look at ──────────────────────────────────────────
//
// Reads for the photo tools. Thumbnails to browse a timeline cheaply, and one
// full-resolution image when detail actually decides the answer: at 480px a
// trichome call would be a guess, and MJ is told to commit to a verdict.

/** At most this many thumbnails in one look. Each is ~50k chars of base64. */
export const MJ_PHOTO_BATCH = 6;

/**
 * Photos for a date range, spread across it rather than bunched at one end,
 * and handed back OLDEST FIRST.
 *
 * A grower who shot forty pictures on harvest day and one a week before it
 * should not get six views of harvest day when they asked how the month went.
 * So the most recent rows are read, then thinned by taking one per day until
 * the batch is full, which is what makes a comparison a comparison.
 *
 * The order at the end is chronological because that is how change reads: the
 * position of a picture in the sequence is its position in time, so "the
 * canopy filled in between the second and the third" means something.
 */
export async function photosForRange(env, userId, growId, { from, to, plantId, limit }) {
  await ensureJournalPhotosSchema(env);
  const cap = Math.max(1, Math.min(MJ_PHOTO_BATCH, Math.round(Number(limit) || MJ_PHOTO_BATCH)));

  const where = ["user_id = ?", "grow_id = ?"];
  const binds = [userId, growId];
  if (from) { where.push("date >= ?"); binds.push(from); }
  if (to)   { where.push("date <= ?"); binds.push(to); }
  if (plantId) { where.push("plant_id = ?"); binds.push(plantId); }

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM journal_photos WHERE ${where.join(" AND ")}`
  ).bind(...binds).first();
  const total = Number(countRow?.n ?? 0);
  if (total === 0) return { photos: [], total: 0 };

  const res = await env.DB.prepare(
    `SELECT id, date, thumb, plant_id FROM journal_photos
     WHERE ${where.join(" AND ")} ORDER BY date DESC, created_at DESC LIMIT 200`
  ).bind(...binds).all();
  const rows = res.results ?? [];

  // One per day first, then fill from what is left, so a range always reads as
  // a spread of days before it reads as a spread of shots.
  const seen = new Set();
  const picked = [];
  for (const r of rows) {
    if (picked.length >= cap) break;
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    picked.push(r);
  }
  for (const r of rows) {
    if (picked.length >= cap) break;
    if (!picked.includes(r)) picked.push(r);
  }
  picked.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { photos: picked, total };
}

/** One photo at the size it was stored, for when detail is the whole question. */
export async function fullPhoto(env, userId, growId, photoId) {
  await ensureJournalPhotosSchema(env);
  return env.DB.prepare(
    "SELECT id, date, data, plant_id FROM journal_photos WHERE id = ? AND user_id = ? AND grow_id = ?"
  ).bind(photoId, userId, growId).first();
}

/**
 * Split a stored data URL into the parts Gemini wants.
 *
 * Photos are stored as `data:image/jpeg;base64,...`; an inlineData part wants
 * the mime type and the payload separately. Anything that is not a data URL
 * returns null and is simply not shown, which is the right outcome for the 1x1
 * placeholder a failed upload leaves behind.
 */
export function toInlineData(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m) return null;
  // The blank placeholder carries no information and is not worth a token.
  if (m[2].length < 200) return null;
  return { mimeType: m[1], data: m[2] };
}
