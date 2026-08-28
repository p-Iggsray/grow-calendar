// Journal photos: pictures attached to a day's journal page. Stored in D1 as
// data URLs (the client downscales before upload - see AddPhotoButton), with a
// small thumbnail column so month/day reads never pull full images.
import { json, error, nowIso, safeJsonBounded } from "./util.js";
import { ownedGrowRow } from "./plants.js";
import { logError } from "./log.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// ~700KB of binary per photo, ~60KB per thumbnail (base64 inflates by 4/3).
// Kept safely under D1's ~1MB bound-parameter ceiling.
const MAX_DATA_CHARS = 980_000;
const MAX_THUMB_CHARS = 80_000;
const MAX_PER_DAY = 6;
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
      data       TEXT NOT NULL,
      thumb      TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
  // Tables created before plant photos existed self-heal the column.
  try { await env.DB.prepare("ALTER TABLE journal_photos ADD COLUMN plant_id TEXT").run(); } catch { /* exists */ }
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
    return { ok: false, message: "photo is too large - try again (it should compress automatically)" };
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
  try {
    await env.DB.prepare(
      "INSERT INTO journal_photos (id, user_id, grow_id, date, plant_id, data, thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.id, growId, p.data.date, plantId, p.data.data, p.data.thumb, nowIso()).run();
  } catch (err) {
    logError("photo-create-failed", { message: String(err?.message) });
    return error(500, "could not save the photo");
  }
  return json({ photo: { id, date: p.data.date, thumb: p.data.thumb, plantId } });
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
    "SELECT id, thumb, plant_id FROM journal_photos WHERE user_id = ? AND grow_id = ? AND date = ? ORDER BY created_at"
  ).bind(userId, growId, date).all();
  return (res.results ?? []).map(r => ({ id: r.id, thumb: r.thumb, plantId: r.plant_id ?? null }));
}

// GET /api/grows/:id/plants/:plantId/photos - one plant's photo timeline,
// newest first.
export async function listPlantPhotos(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureJournalPhotosSchema(env);
  const res = await env.DB.prepare(
    "SELECT id, date, thumb FROM journal_photos WHERE user_id = ? AND grow_id = ? AND plant_id = ? ORDER BY date DESC, created_at DESC"
  ).bind(user.id, growId, plantId).all();
  return json({ photos: (res.results ?? []).map(r => ({ id: r.id, date: r.date, thumb: r.thumb })) });
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
