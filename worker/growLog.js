import { json, error } from "./util.js";

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

function rowToEntry(row) {
  return {
    water_gal:    row.water_gal    ?? null,
    feed:         row.feed         ?? null,
    temp_high:    row.temp_high    ?? null,
    temp_low:     row.temp_low     ?? null,
    humidity:     row.humidity     ?? null,
    ec_in:        row.ec_in        ?? null,
    ec_out:       row.ec_out       ?? null,
    training:     tryParseArray(row.training),
    plant_health: tryParseArray(row.plant_health),
  };
}

function csvEscape(s) {
  const str = s == null ? "" : String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

let _schemaReady = false;

export async function ensureGrowLogSchema(env) {
  if (_schemaReady) return;
  const cols = [
    "ALTER TABLE grow_log ADD COLUMN ec_in REAL",
    "ALTER TABLE grow_log ADD COLUMN ec_out REAL",
    "ALTER TABLE grow_log ADD COLUMN training TEXT",
    "ALTER TABLE grow_log ADD COLUMN plant_health TEXT",
  ];
  for (const sql of cols) {
    try { await env.DB.prepare(sql).run(); } catch { /* column exists */ }
  }
  _schemaReady = true;
}

export async function getGrowLog(env, user, date) {
  await ensureGrowLogSchema(env);
  const row = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND date = ?"
  ).bind(user.id, date).first();
  return json({ date, entry: row ? rowToEntry(row) : null });
}

export async function putGrowLog(request, env, user, date) {
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  await ensureGrowLogSchema(env);

  const { water_gal, feed, temp_high, temp_low, humidity, ec_in, ec_out, training, plant_health } = body ?? {};

  const trainingJson    = Array.isArray(training)    ? JSON.stringify(training)    : null;
  const plantHealthJson = Array.isArray(plant_health) ? JSON.stringify(plant_health) : null;

  await env.DB.prepare(`
    INSERT INTO grow_log (user_id, date, water_gal, feed, temp_high, temp_low, humidity, ec_in, ec_out, training, plant_health, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET
      water_gal    = excluded.water_gal,
      feed         = excluded.feed,
      temp_high    = excluded.temp_high,
      temp_low     = excluded.temp_low,
      humidity     = excluded.humidity,
      ec_in        = excluded.ec_in,
      ec_out       = excluded.ec_out,
      training     = excluded.training,
      plant_health = excluded.plant_health,
      updated_at   = excluded.updated_at
  `).bind(
    user.id, date,
    toNum(water_gal), toStr(feed), toNum(temp_high), toNum(temp_low), toNum(humidity),
    toNum(ec_in), toNum(ec_out), trainingJson, plantHealthJson,
  ).run();

  return json({ ok: true });
}

export async function exportGrowLogCsv(env, user) {
  await ensureGrowLogSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? ORDER BY date ASC"
  ).bind(user.id).all();

  const header = "date,water_gal,feed,temp_high,temp_low,humidity,ec_in,ec_out,training,plant_health\r\n";
  const rows = results.map(r =>
    [
      r.date,
      r.water_gal  ?? "",
      csvEscape(r.feed),
      r.temp_high  ?? "",
      r.temp_low   ?? "",
      r.humidity   ?? "",
      r.ec_in      ?? "",
      r.ec_out     ?? "",
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
