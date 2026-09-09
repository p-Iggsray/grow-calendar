import { json, error, safeJsonBounded } from "./util.js";
import { readKey } from "../src/lib/entryReading.js";

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v, maxLen = 500) {
  if (!v || typeof v !== "string") return null;
  return v.trim().slice(0, maxLen) || null;
}

function tryParseArray(s) {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function tryParseObject(s) {
  if (!s) return {};
  try { const v = JSON.parse(s); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

export function rowToEntry(row) {
  return {
    read_from:    tryParseObject(row.read_from),
    water_gal:    row.water_gal    ?? null,
    feed:         row.feed         ?? null,
    temp_high:    row.temp_high    ?? null,
    temp_low:     row.temp_low     ?? null,
    humidity:     row.humidity     ?? null,
    water_plants: tryParseArray(row.water_plants),
    training:     tryParseArray(row.training),
    plant_health: tryParseArray(row.plant_health),
  };
}

function csvEscape(s) {
  let str = s == null ? "" : String(s);
  // Neutralize spreadsheet formula injection: a cell beginning with one of
  // these is executed as a formula by Excel/Sheets. Prefix a single quote.
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

let _schemaReady = false;

export async function ensureGrowLogSchema(env) {
  if (_schemaReady) return;
  // Self-heal the table like plant_log/grows do, rather than assuming schema.sql
  // already ran. Without this, a fresh/partial D1 makes every grow_log write
  // throw an unhandled 500. If the CREATE throws it propagates and _schemaReady
  // stays false, so the next request retries instead of caching "ready".
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS grow_log (
      user_id      INTEGER NOT NULL,
      grow_id      TEXT NOT NULL,
      date         TEXT NOT NULL,
      water_gal    REAL,
      feed         TEXT,
      temp_high    REAL,
      temp_low     REAL,
      humidity     REAL,
      ec_in        REAL,
      ec_out       REAL,
      water_plants TEXT,
      training     TEXT,
      plant_health TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, grow_id, date)
    )
  `).run();
  // Backfill columns on databases created before they were added (no-ops on a
  // freshly-created table above).
  const cols = [
    "ALTER TABLE grow_log ADD COLUMN ec_in REAL",
    "ALTER TABLE grow_log ADD COLUMN ec_out REAL",
    "ALTER TABLE grow_log ADD COLUMN training TEXT",
    "ALTER TABLE grow_log ADD COLUMN plant_health TEXT",
    "ALTER TABLE grow_log ADD COLUMN water_plants TEXT",
    // 1 = row created by the weather auto-logger with no grower input yet.
    "ALTER TABLE grow_log ADD COLUMN auto_weather INTEGER",
    // Which of this row's fields were read out of the day's written entry
    // rather than typed into the log, as {"water":true,"feed":true}. It is what
    // lets the record say where each number came from, and what stops a re-read
    // from overwriting a correction made by hand.
    "ALTER TABLE grow_log ADD COLUMN read_from TEXT",
  ];
  for (const sql of cols) {
    try { await env.DB.prepare(sql).run(); } catch { /* column exists */ }
  }
  _schemaReady = true;
}

// A day counts as "logged" when any real data was entered BY THE GROWER: a
// numeric reading, a feed note, or at least one watering/training/health row.
// Drives the calendar's completion ring (logged day = full ring). Rows the
// weather auto-logger created on its own don't count - the ring and the
// journal timeline reflect the grower's activity, not the sky's.
export function isLogFilled(row) {
  if (!row) return false;
  if (Number(row.auto_weather) === 1) return false;
  if (row.water_gal != null || row.temp_high != null || row.temp_low != null || row.humidity != null) return true;
  if (row.feed) return true;
  for (const k of ["water_plants", "training", "plant_health"]) {
    if (tryParseArray(row[k]).length > 0) return true;
  }
  return false;
}

// GET /api/grow-log/month?month=YYYY-MM -> { month, days: { "YYYY-MM-DD": true } }
export async function getMonthGrowLog(env, user, growId, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return error(400, "month must be YYYY-MM");
  await ensureGrowLogSchema(env);
  const res = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date LIKE ?"
  ).bind(user.id, growId, month + "-%").all();
  const days = {};
  for (const r of res.results ?? []) {
    if (isLogFilled(r)) days[r.date] = true;
  }
  return json({ month, days });
}

export async function getGrowLog(env, user, growId, date) {
  await ensureGrowLogSchema(env);
  const row = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?"
  ).bind(user.id, growId, date).first();
  return json({ date, entry: row ? rowToEntry(row) : null });
}

// What a caller is allowed to write, and how each column is cast on the way
// in. The keys are also the only strings ever interpolated into the SQL below.
const WRITABLE = {
  water_gal:    (v) => toNum(v),
  feed:         (v) => toStr(v),
  temp_high:    (v) => toNum(v),
  temp_low:     (v) => toNum(v),
  humidity:     (v) => toNum(v),
  water_plants: (v) => (Array.isArray(v) ? JSON.stringify(v) : null),
  training:     (v) => (Array.isArray(v) ? JSON.stringify(v) : null),
  plant_health: (v) => (Array.isArray(v) ? JSON.stringify(v) : null),
};

/**
 * Which columns a save touches, what they become, and what is left marked as
 * read from the day's written entry afterwards.
 *
 * Pure, because this is where the damage used to be done. The endpoint used to
 * replace the whole row from the body, so the Conditions card saving three
 * numbers wrote NULL over the water, the feed and everything a reading of the
 * entry had put there, and cleared the provenance for all of it. A day's log is
 * edited from several places at once, so a save has to be a patch: a column
 * absent from the body keeps whatever it already held.
 */
export function growLogPatch(body, existingReadFrom) {
  const cols = Object.keys(WRITABLE).filter((k) => body && Object.hasOwn(body, k));

  // A value the grower has now typed by hand is theirs, so it stops being
  // marked as read and the next reading will not overwrite it. Only the fields
  // in this save lose that mark: correcting the humidity says nothing about who
  // wrote the watering.
  const nextRead = tryParseObject(existingReadFrom);
  for (const c of cols) delete nextRead[readKey(c)];

  return {
    cols,
    values: cols.map((c) => WRITABLE[c](body[c])),
    readJson: Object.keys(nextRead).length ? JSON.stringify(nextRead) : null,
  };
}

/**
 * Write the fields a caller actually sent, and only those.
 *
 * auto_weather resets to 0 either way: the grower touched this row, so it now
 * counts as a real logged day even if some values started as auto-filled
 * weather.
 */
export async function putGrowLog(request, env, user, growId, date) {
  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  await ensureGrowLogSchema(env);

  const existing = await env.DB.prepare(
    "SELECT read_from FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?",
  ).bind(user.id, growId, date).first();

  const { cols, values, readJson } = growLogPatch(body, existing?.read_from);
  if (cols.length === 0) return json({ ok: true });

  const sets = cols.map((c) => `${c} = excluded.${c}`).join(",\n      ");
  await env.DB.prepare(`
    INSERT INTO grow_log (user_id, grow_id, date, ${cols.join(", ")}, read_from, auto_weather, updated_at)
    VALUES (?, ?, ?, ${cols.map(() => "?").join(", ")}, ?, 0, datetime('now'))
    ON CONFLICT(user_id, grow_id, date) DO UPDATE SET
      ${sets},
      read_from    = excluded.read_from,
      auto_weather = 0,
      updated_at   = excluded.updated_at
  `).bind(user.id, growId, date, ...values, readJson).run();

  return json({ ok: true });
}

export async function exportGrowLogCsv(env, user, growId) {
  await ensureGrowLogSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? ORDER BY date ASC"
  ).bind(user.id, growId).all();

  const header = "date,water_gal,feed,temp_high,temp_low,humidity,water_plants,training,plant_health\r\n";
  const rows = results.map(r =>
    [
      r.date,
      r.water_gal  ?? "",
      csvEscape(r.feed),
      r.temp_high  ?? "",
      r.temp_low   ?? "",
      r.humidity   ?? "",
      csvEscape(r.water_plants),
      csvEscape(r.training),
      csvEscape(r.plant_health),
    ].join(",")
  ).join("\r\n");

  return new Response(header + rows, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="grow-log.csv"',
    },
  });
}
