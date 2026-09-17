// @ts-check
//
// The friend view: a read-only window onto a grower's journal, opened by a
// share link and nothing else. No session, no cookie, no account.
//
// Every route here takes a token instead of a user, resolves it through
// shareContext (which decides which spaces the link reaches), and then reads
// with the same helpers the owner's own routes use. Nothing writes. Nothing
// calls upstream: a public URL must never be a way to spend someone's weather
// or model quota, so a shared day reports the climate already written into its
// log rather than fetching any.
import { json, error, base64ToBytes } from "./util.js";
import { shareContext, shareSurvey, shareLifecycle } from "./share.js";
import { isLogFilled, rowToEntry, ensureGrowLogSchema } from "./growLog.js";
import { journalPlantEntry, buildMonthIndex, buildTimelineDays } from "./journal.js";
import { readNote } from "./notes.js";
import { ensurePlantLogSchema } from "./plants.js";
import { photosForDay, photoCountsForMonth, photoCountsForDates, ensureJournalPhotosSchema } from "./photos.js";
import { stageFromRow } from "./stages.js";
import { buildRunningTimeline, growAnchor } from "../src/lib/stageTimeline.js";
import { sanitizeHtml, looksLikeHtml } from "../src/lib/richText.js";
import { words } from "../src/lib/crops.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const GROW_ID_RE = /^[A-Za-z0-9]{1,40}$/;
const PHOTO_ID_RE = /^[A-Za-z0-9_]{1,60}$/;

// One page of the read-everything scroll. Large enough that scrolling feels
// continuous on a long grow, small enough that the first paint is quick.
export const SHARE_TIMELINE_PAGE = 30;

// One screenful of the gallery, several times over. Ids only, so a page of
// these is a couple of kilobytes and the pictures arrive as tiles scroll in.
export const SHARE_PHOTO_PAGE = 60;

// Resolve a token and a space in one step. Returns either the context and the
// grow, or the Response to send instead.
//
// A space the link does not reach answers 404 rather than 403: a link holder
// should not be able to probe which space ids exist by reading status codes.
async function openSpace(env, token, growId) {
  const ctx = await shareContext(env, token);
  if (!ctx) return { res: error(404, "share link not found or has been revoked") };
  if (!GROW_ID_RE.test(String(growId ?? "")) || !ctx.growIds.has(growId)) {
    return { res: error(404, "space not found") };
  }
  return { ctx, grow: ctx.grows.find((g) => g.id === growId) };
}

// A stored note goes out already reduced to the editor's whitelisted tags.
// The owner's page sanitizes on render too, but this one is public, so the
// bytes that leave the server are the safe ones.
function shareNote(body) {
  const text = String(body ?? "");
  return looksLikeHtml(text) ? sanitizeHtml(text) : text;
}

function plantNames(survey) {
  const map = {};
  for (const p of survey?.strains ?? []) {
    if (p?.id) map[p.id] = p.name || words(survey).Unit;
  }
  return map;
}

// Stage timelines for every shared space, in two queries rather than two per
// space: one pass over the grower's stage rows, then the pure builder per grow.
async function timelinesForSpaces(env, ctx) {
  const out = new Map();
  for (const g of ctx.grows) out.set(g.id, { events: [], firstDate: growAnchor(g.createdAt) });
  if (!ctx.grows.length) return out;

  try {
    await ensurePlantLogSchema(env);
    const res = await env.DB.prepare(
      `SELECT grow_id, date, body, detail, plant_id FROM plant_log
       WHERE user_id = ? AND kind = 'stage'
       ORDER BY date ASC, id ASC`
    ).bind(ctx.userId).all();

    const byGrow = new Map();
    for (const r of res.results ?? []) {
      if (!out.has(r.grow_id)) continue;
      const stage = stageFromRow(r);
      if (!stage) continue;
      if (!byGrow.has(r.grow_id)) byGrow.set(r.grow_id, []);
      byGrow.get(r.grow_id).push({ date: r.date, stage, plantId: r.plant_id });
    }
    for (const [growId, records] of byGrow) {
      const entry = out.get(growId);
      entry.events = buildRunningTimeline(records, entry.firstDate);
    }
  } catch { /* no stage history yet: every space keeps its empty timeline */ }

  return out;
}

// The most recent day each space has anything recorded on, in one query.
//
// This is what the calendar opens on. Landing on today's month is wrong for
// any grow that is not currently running: a friend sent a link to a finished
// grow would arrive at a blank grid with nothing to tap and no clue which way
// to walk. An auto-filled weather row is not content, so it cannot be what a
// month is chosen for.
async function lastWrittenDays(env, ctx) {
  const out = new Map();
  try {
    const res = await env.DB.prepare(
      `SELECT grow_id, MAX(date) AS last FROM (
         SELECT grow_id, date FROM grow_log
           WHERE user_id = ?1 AND (auto_weather IS NULL OR auto_weather != 1)
         UNION ALL SELECT grow_id, date FROM day_notes WHERE user_id = ?1 AND TRIM(body) != ''
         UNION ALL SELECT grow_id, date FROM plant_log WHERE user_id = ?1
         UNION ALL SELECT grow_id, date FROM journal_photos WHERE user_id = ?1
       ) GROUP BY grow_id`
    ).bind(ctx.userId).all();
    for (const r of res.results ?? []) if (r.last) out.set(r.grow_id, r.last);
  } catch { /* nothing written anywhere yet */ }
  return out;
}

// GET /api/share/:token
//
// The index the friend view opens on: every space the link reaches, newest
// first with the active one promoted, each carrying enough to label a tab.
export async function getShareSpaces(env, token) {
  const ctx = await shareContext(env, token);
  if (!ctx) return error(404, "share link not found or has been revoked");
  if (!ctx.grows.length) return error(404, "nothing has been shared yet");

  await ensureGrowLogSchema(env);
  await ensureJournalPhotosSchema(env);
  const [timelines, lastDays] = await Promise.all([
    timelinesForSpaces(env, ctx),
    lastWrittenDays(env, ctx),
  ]);
  const spaces = ctx.grows.map((g) => {
    const t = timelines.get(g.id);
    return {
      id: g.id,
      name: g.displayName || "Untitled space",
      status: g.status,
      survey: shareSurvey(g.survey),
      lifecycle: shareLifecycle(g.lifecycle),
      stageEvents: t.events,
      firstDate: t.firstDate,
      lastDate: lastDays.get(g.id) ?? null,
    };
  });
  // An active space is what someone following along wants first.
  spaces.sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1));

  return json({ spaces, defaultSpaceId: spaces[0]?.id ?? null });
}

// GET /api/share/:token/grows/:growId/month/:month
//
// Which days of a month hold anything, so the calendar knows what is worth
// tapping. Same four sources the grower's own month index reads.
export async function getShareMonth(env, token, growId, month) {
  const { res, ctx } = await openSpace(env, token, growId);
  if (res) return res;
  if (!MONTH_RE.test(String(month ?? ""))) return error(400, "invalid month, expected YYYY-MM");

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);
  const like = month + "-%";

  const [logRes, noteRes, plantRes, photoCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date LIKE ?`
    ).bind(ctx.userId, growId, like).all(),
    env.DB.prepare(
      `SELECT date FROM day_notes WHERE user_id = ? AND grow_id = ? AND date LIKE ? AND TRIM(body) != ''`
    ).bind(ctx.userId, growId, like).all(),
    env.DB.prepare(
      `SELECT date, COUNT(*) AS n FROM plant_log
       WHERE user_id = ? AND grow_id = ? AND date LIKE ? GROUP BY date`
    ).bind(ctx.userId, growId, like).all(),
    photoCountsForMonth(env, ctx.userId, growId, month).catch(() => ({})),
  ]);

  const days = buildMonthIndex(logRes.results, noteRes.results, plantRes.results);
  for (const [date, n] of Object.entries(photoCounts)) {
    (days[date] ??= { log: false, note: false, plants: 0 }).photos = n;
  }
  return json({ month, days });
}

// GET /api/share/:token/grows/:growId/day/:date
//
// One day, whole: what the sky or the tent did, what was written, what was
// done to each plant, and every picture taken.
export async function getShareDay(env, token, growId, date) {
  const { res, ctx, grow } = await openSpace(env, token, growId);
  if (res) return res;
  if (!DATE_RE.test(String(date ?? ""))) return error(400, "invalid date, expected YYYY-MM-DD");

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);
  const names = plantNames(grow.survey);

  const [logRow, note, plantRes, photos] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?"
    ).bind(ctx.userId, growId, date).first(),
    readNote(env, ctx.userId, growId, date).catch(() => ""),
    env.DB.prepare(
      `SELECT id, plant_id, date, kind, detail, body, height, height_unit, health
       FROM plant_log WHERE user_id = ? AND grow_id = ? AND date = ?
       ORDER BY plant_id, id ASC`
    ).bind(ctx.userId, growId, date).all(),
    photosForDay(env, ctx.userId, growId, date).catch(() => []),
  ]);

  // Reminders are the grower's own to-do list rather than a record of what
  // happened, so grow_events is not read here at all.
  return json({
    date,
    log: logRow && isLogFilled(logRow) ? rowToEntry(logRow) : null,
    note: shareNote(note),
    plantEntries: (plantRes.results ?? []).map((r) => journalPlantEntry(r, names)),
    photos,
  });
}

// GET /api/share/:token/grows/:growId/timeline?before=YYYY-MM-DD
//
// Every day that holds something, newest first, one page at a time. This is
// the "read the whole thing" view: no calendar, just the grow back to front.
export async function getShareTimeline(env, token, growId, before) {
  const { res, ctx } = await openSpace(env, token, growId);
  if (res) return res;
  const cursor = DATE_RE.test(String(before ?? "")) ? before : "9999-12-31";

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);

  // Union the dated tables to find which days exist, then page over that list
  // and read only the page. A grow with 400 logged days still answers in one
  // page's worth of rows.
  const dateRes = await env.DB.prepare(
    `SELECT date FROM (
       SELECT date FROM grow_log   WHERE user_id = ?1 AND grow_id = ?2
       UNION SELECT date FROM day_notes WHERE user_id = ?1 AND grow_id = ?2 AND TRIM(body) != ''
       UNION SELECT date FROM plant_log WHERE user_id = ?1 AND grow_id = ?2
     ) WHERE date < ?3 ORDER BY date DESC LIMIT ?4`
  ).bind(ctx.userId, growId, cursor, SHARE_TIMELINE_PAGE + 1).all();

  const dates = (dateRes.results ?? []).map((r) => r.date);
  const hasMore = dates.length > SHARE_TIMELINE_PAGE;
  const page = dates.slice(0, SHARE_TIMELINE_PAGE);
  if (!page.length) return json({ days: [], hasMore: false, nextBefore: null });

  const marks = page.map(() => "?").join(",");
  const [logRes, noteRes, plantRes, photoCounts] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date IN (${marks})`
    ).bind(ctx.userId, growId, ...page).all(),
    env.DB.prepare(
      `SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND date IN (${marks})`
    ).bind(ctx.userId, growId, ...page).all(),
    env.DB.prepare(
      `SELECT date, COUNT(*) AS n, GROUP_CONCAT(DISTINCT kind) AS kinds FROM plant_log
       WHERE user_id = ? AND grow_id = ? AND date IN (${marks}) GROUP BY date`
    ).bind(ctx.userId, growId, ...page).all(),
    photoCountsForDates(env, ctx.userId, growId, page).catch(() => ({})),
  ]);

  const days = buildTimelineDays(logRes.results, noteRes.results, plantRes.results);
  for (const d of days) d.photos = photoCounts[d.date] ?? 0;

  return json({
    days,
    hasMore,
    nextBefore: hasMore ? page[page.length - 1] : null,
  });
}

// GET /api/share/:token/grows/:growId/photos?offset=N
//
// Every picture in one space, newest first, as a gallery of its own. Ids only:
// each tile fetches its own thumbnail through the photo route below.
export async function getSharePhotos(env, token, growId, offsetRaw) {
  const { res, ctx, grow } = await openSpace(env, token, growId);
  if (res) return res;
  const offset = Math.max(0, Math.min(100_000, Number(offsetRaw) || 0));

  await ensureJournalPhotosSchema(env);
  const names = plantNames(grow.survey);
  const rows = await env.DB.prepare(
    `SELECT id, date, plant_id FROM journal_photos
     WHERE user_id = ? AND grow_id = ?
     ORDER BY date DESC, created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(ctx.userId, growId, SHARE_PHOTO_PAGE + 1, offset).all();

  const all = rows.results ?? [];
  const hasMore = all.length > SHARE_PHOTO_PAGE;
  return json({
    photos: all.slice(0, SHARE_PHOTO_PAGE).map((r) => ({
      id: r.id,
      date: r.date,
      plantName: r.plant_id ? (names[r.plant_id] ?? null) : null,
    })),
    hasMore,
    nextOffset: hasMore ? offset + SHARE_PHOTO_PAGE : null,
  });
}

const DATA_URL_PREFIX = /^data:([a-z0-9/+.-]+);base64,(.*)$/i;

// GET /api/share/:token/photos/:photoId/(thumb|full)
//
// The owner's /api/photos/:id/:size is session-authorised, and a friend has no
// session. This is the same bytes behind the link instead, with the extra
// check that matters: the picture must belong to the link's owner AND to a
// space the link actually reaches, so archiving a space takes its photographs
// off the link along with everything else.
export async function getSharePhoto(env, token, photoId, size) {
  const ctx = await shareContext(env, token);
  if (!ctx) return error(404, "share link not found or has been revoked");
  if (!PHOTO_ID_RE.test(String(photoId ?? ""))) return error(400, "invalid photo id");

  await ensureJournalPhotosSchema(env);
  const column = size === "full" ? "data" : "thumb";
  const row = await env.DB.prepare(
    `SELECT grow_id, ${column} AS url FROM journal_photos WHERE id = ? AND user_id = ?`
  ).bind(photoId, ctx.userId).first();
  if (!row?.url || !ctx.growIds.has(row.grow_id)) return error(404, "photo not found");

  const m = DATA_URL_PREFIX.exec(row.url);
  if (!m) return error(500, "that photo is not stored as an image");
  let bytes;
  try { bytes = base64ToBytes(m[2]); }
  catch { return error(500, "that photo could not be decoded"); }

  return new Response(bytes, {
    headers: {
      "content-type": m[1],
      "content-length": String(bytes.length),
      // Private even here. The link is unlisted, and a shared cache holding
      // someone's grow photographs is not something a revoke could undo.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
