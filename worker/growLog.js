import { json, error, safeJsonBounded } from "./util.js";

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

export function rowToEntry(row) {
  return {
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

export async function putGrowLog(request, env, user, growId, date) {
  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  await ensureGrowLogSchema(env);

  const { water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health } = body ?? {};

  const waterPlantsJson = Array.isArray(water_plants)  ? JSON.stringify(water_plants)  : null;
  const trainingJson    = Array.isArray(training)      ? JSON.stringify(training)      : null;
  const plantHealthJson = Array.isArray(plant_health)  ? JSON.stringify(plant_health)  : null;

  // auto_weather resets to 0: the grower touched this row, so it now counts
  // as a real logged day even if some values started as auto-filled weather.
  await env.DB.prepare(`
    INSERT INTO grow_log (user_id, grow_id, date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health, auto_weather, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    ON CONFLICT(user_id, grow_id, date) DO UPDATE SET
      water_gal    = excluded.water_gal,
      feed         = excluded.feed,
      temp_high    = excluded.temp_high,
      temp_low     = excluded.temp_low,
      humidity     = excluded.humidity,
      water_plants = excluded.water_plants,
      training     = excluded.training,
      plant_health = excluded.plant_health,
      auto_weather = 0,
      updated_at   = excluded.updated_at
  `).bind(
    user.id, growId, date,
    toNum(water_gal), toStr(feed), toNum(temp_high), toNum(temp_low), toNum(humidity),
    waterPlantsJson, trainingJson, plantHealthJson,
  ).run();

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
