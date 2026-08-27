// Custom calendar events: single-day, user-created entries ("Feed day",
// "Flip to 12/12", "Trim session") that live on the month grid and on each
// day's journal page. Deliberately simple - a date, a title, an optional
// time and note - unlike the removed task-rule engine.
import { json, error, nowIso } from "./util.js";
import { ownedGrowRow } from "./plants.js";
import { logError } from "./log.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TITLE = 80;
const MAX_NOTES = 300;
const MAX_PER_DAY = 20;
const MAX_PER_GROW = 1000;

let _schemaReady = false;
export async function ensureGrowEventsSchema(env) {
  if (_schemaReady) return;
  // Self-heal like grow_log/plant_log so a fresh D1 never 500s.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS grow_events (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      grow_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      title      TEXT NOT NULL,
      time       TEXT,
      notes      TEXT,
      created_at TEXT NOT NULL
    )
  `).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_grow_events_day ON grow_events (grow_id, date)"
  ).run();
  _schemaReady = true;
}

function newEventId() {
  return "ev" + crypto.randomUUID().replaceAll("-", "").slice(0, 14);
}

// Pure: validate + normalize a create/patch payload. `partial` allows missing
// fields (PATCH). Returns { ok:true, fields } or { ok:false, message }.
export function validateEventInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  const fields = {};

  if (body.date !== undefined || !partial) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return { ok: false, message: "date must be YYYY-MM-DD" };
    }
    fields.date = body.date;
  }
  if (body.title !== undefined || !partial) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return { ok: false, message: "title is required" };
    if (title.length > MAX_TITLE) return { ok: false, message: `title must be ${MAX_TITLE} characters or fewer` };
    fields.title = title;
  }
  if (body.time !== undefined) {
    if (body.time === null || body.time === "") fields.time = null;
    else if (typeof body.time === "string" && TIME_RE.test(body.time)) fields.time = body.time;
    else return { ok: false, message: "time must be HH:MM (24h)" };
  }
  if (body.notes !== undefined) {
    if (body.notes === null) fields.notes = null;
    else if (typeof body.notes === "string") {
      const n = body.notes.trim().slice(0, MAX_NOTES);
      fields.notes = n || null;
    } else return { ok: false, message: "notes must be text" };
  }
  return { ok: true, fields };
}

function shapeEvent(r) {
  return { id: r.id, date: r.date, title: r.title, time: r.time ?? null, notes: r.notes ?? null };
}

// Consistent ordering everywhere: by date, timed events in time order first,
// untimed ("all-day") after them, ties by creation.
const ORDER = "ORDER BY date, time IS NULL, time, created_at";

// GET /api/grows/:id/events?month=YYYY-MM  (or ?date=YYYY-MM-DD)
export async function listGrowEvents(env, user, growId, url) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureGrowEventsSchema(env);
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  let where, bind;
  if (date && DATE_RE.test(date)) {
    where = "date = ?"; bind = date;
  } else if (month && MONTH_RE.test(month)) {
    where = "date LIKE ?"; bind = month + "-%";
  } else {
    return error(400, "month=YYYY-MM or date=YYYY-MM-DD query param required");
  }
  const res = await env.DB.prepare(
    `SELECT id, date, title, time, notes FROM grow_events
     WHERE user_id = ? AND grow_id = ? AND ${where} ${ORDER}`
  ).bind(user.id, growId, bind).all();
  return json({ events: (res.results ?? []).map(shapeEvent) });
}

// POST /api/grows/:id/events  {date, title, time?, notes?}
export async function createGrowEvent(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid JSON"); }
  const v = validateEventInput(body);
  if (!v.ok) return error(400, v.message);
  await ensureGrowEventsSchema(env);

  const [{ dayCount }, { growCount }] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS dayCount FROM grow_events WHERE grow_id = ? AND date = ?")
      .bind(growId, v.fields.date).first(),
    env.DB.prepare("SELECT COUNT(*) AS growCount FROM grow_events WHERE grow_id = ?")
      .bind(growId).first(),
  ]);
  if (dayCount >= MAX_PER_DAY) return error(400, `a day holds at most ${MAX_PER_DAY} events`);
  if (growCount >= MAX_PER_GROW) return error(400, "event limit reached for this grow");

  const ev = {
    id: newEventId(),
    date: v.fields.date,
    title: v.fields.title,
    time: v.fields.time ?? null,
    notes: v.fields.notes ?? null,
  };
  try {
    await env.DB.prepare(
      "INSERT INTO grow_events (id, user_id, grow_id, date, title, time, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(ev.id, user.id, growId, ev.date, ev.title, ev.time, ev.notes, nowIso()).run();
  } catch (err) {
    logError("event-create-failed", { message: String(err?.message) });
    return error(500, "could not save the event");
  }
  return json({ event: ev });
}

// PATCH /api/grows/:id/events/:eventId  {date?, title?, time?, notes?}
export async function patchGrowEvent(request, env, user, growId, eventId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid JSON"); }
  const v = validateEventInput(body, { partial: true });
  if (!v.ok) return error(400, v.message);
  const keys = Object.keys(v.fields);
  if (keys.length === 0) return json({ ok: true });
  await ensureGrowEventsSchema(env);

  const sets = keys.map(k => `${k} = ?`).join(", ");
  const { meta } = await env.DB.prepare(
    `UPDATE grow_events SET ${sets} WHERE id = ? AND grow_id = ? AND user_id = ?`
  ).bind(...keys.map(k => v.fields[k]), eventId, growId, user.id).run();
  if (!meta.changes) return error(404, "event not found");
  return json({ ok: true });
}

// DELETE /api/grows/:id/events/:eventId
export async function deleteGrowEvent(env, user, growId, eventId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensureGrowEventsSchema(env);
  const { meta } = await env.DB.prepare(
    "DELETE FROM grow_events WHERE id = ? AND grow_id = ? AND user_id = ?"
  ).bind(eventId, growId, user.id).run();
  if (!meta.changes) return error(404, "event not found");
  return json({ ok: true });
}

// Events for one day, already shaped - folded into the journal day payload.
export async function eventsForDay(env, userId, growId, date) {
  await ensureGrowEventsSchema(env);
  const res = await env.DB.prepare(
    `SELECT id, date, title, time, notes FROM grow_events
     WHERE user_id = ? AND grow_id = ? AND date = ? ${ORDER}`
  ).bind(userId, growId, date).all();
  return (res.results ?? []).map(shapeEvent);
}

// date -> count map for a month - drives the calendar's event marks alongside
// the journal month index.
export async function eventCountsForMonth(env, userId, growId, month) {
  await ensureGrowEventsSchema(env);
  const res = await env.DB.prepare(
    "SELECT date, COUNT(*) AS n FROM grow_events WHERE user_id = ? AND grow_id = ? AND date LIKE ? GROUP BY date"
  ).bind(userId, growId, month + "-%").all();
  return Object.fromEntries((res.results ?? []).map(r => [r.date, r.n]));
}
