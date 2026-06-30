// @ts-check
// Per-grow environment readings imported from a controller CSV export
// (AC-Infinity-style: minute-resolution temp / humidity / VPD). One environment
// per grow. Readings are keyed by minute so re-importing overlapping reports is
// idempotent. The UI shows overall averages/extremes, a per-day log, and a
// day drill-down.
import { json, error, safeJsonBounded } from "./util.js";

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

let _envSchemaReady = false;
async function ensureEnvSchema(env) {
  if (_envSchemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS env_readings (
      user_id  INTEGER NOT NULL,
      grow_id  TEXT NOT NULL,
      ts       TEXT NOT NULL,          -- minute, "YYYY-MM-DDTHH:MM"
      date     TEXT NOT NULL,          -- "YYYY-MM-DD"
      temp_f   REAL,
      humidity REAL,
      vpd      REAL,
      PRIMARY KEY (user_id, grow_id, ts)
    )
  `).run();
  try {
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_env_readings_day ON env_readings(user_id, grow_id, date)`
    ).run();
  } catch { /* index may already exist */ }
  _envSchemaReady = true;
}

async function ownsGrow(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  return !!row;
}

function clampNum(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

// POST /api/grows/:id/env/import  { readings: [{ ts, tempF, humidity, vpd }] }
// Client parses the CSV and sends readings in chunks. INSERT OR REPLACE keeps
// re-imports idempotent at minute granularity.
export async function importEnvReadings(request, env, user, growId) {
  if (!(await ownsGrow(env, user.id, growId))) return error(404, "grow not found");
  await ensureEnvSchema(env);

  let body;
  { const p = await safeJsonBounded(request, 1_048_576); if (!p.ok) return error(p.status, p.error); body = p.data; }
  const readings = body?.readings;
  if (!Array.isArray(readings)) return error(400, "readings array required");
  if (readings.length > 5000) return error(400, "too many readings in one request (max 5000)");

  // Validate + normalize; drop rows with no usable value.
  const rows = [];
  for (const r of readings) {
    const ts = typeof r?.ts === "string" ? r.ts.slice(0, 16) : "";
    if (!TS_RE.test(ts)) continue;
    const temp_f = clampNum(r.tempF, -50, 200);
    const humidity = clampNum(r.humidity, 0, 100);
    const vpd = clampNum(r.vpd, 0, 30);
    if (temp_f === null && humidity === null && vpd === null) continue;
    rows.push({ ts, date: ts.slice(0, 10), temp_f, humidity, vpd });
  }
  if (rows.length === 0) return json({ ok: true, inserted: 0 });

  // Multi-row INSERT OR REPLACE, sub-chunked to stay well under SQLite's bind
  // variable limit (7 vars/row).
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "(?,?,?,?,?,?,?)").join(",");
    const binds = [];
    for (const r of slice) binds.push(user.id, growId, r.ts, r.date, r.temp_f, r.humidity, r.vpd);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO env_readings (user_id, grow_id, ts, date, temp_f, humidity, vpd) VALUES ${placeholders}`
    ).bind(...binds).run();
  }

  return json({ ok: true, inserted: rows.length });
}

// GET /api/grows/:id/env/summary → overall stats + per-day rollup.
export async function getEnvSummary(env, user, growId) {
  if (!(await ownsGrow(env, user.id, growId))) return error(404, "grow not found");
  await ensureEnvSchema(env);

  const overall = await env.DB.prepare(`
    SELECT
      COUNT(*) AS samples,
      MIN(ts) AS first_ts, MAX(ts) AS last_ts,
      ROUND(AVG(temp_f),1) AS t_avg, MIN(temp_f) AS t_min, MAX(temp_f) AS t_max,
      ROUND(AVG(humidity),1) AS h_avg, MIN(humidity) AS h_min, MAX(humidity) AS h_max,
      ROUND(AVG(vpd),2) AS v_avg, MIN(vpd) AS v_min, MAX(vpd) AS v_max
    FROM env_readings WHERE user_id = ? AND grow_id = ?
  `).bind(user.id, growId).first();

  const daysRes = await env.DB.prepare(`
    SELECT date,
      COUNT(*) AS samples,
      ROUND(AVG(temp_f),1) AS t_avg, MIN(temp_f) AS t_min, MAX(temp_f) AS t_max,
      ROUND(AVG(humidity),1) AS h_avg, MIN(humidity) AS h_min, MAX(humidity) AS h_max,
      ROUND(AVG(vpd),2) AS v_avg, MIN(vpd) AS v_min, MAX(vpd) AS v_max
    FROM env_readings WHERE user_id = ? AND grow_id = ?
    GROUP BY date ORDER BY date DESC
  `).bind(user.id, growId).all();

  const days = (daysRes.results ?? []).map(d => ({
    date: d.date, samples: d.samples,
    temp: { avg: d.t_avg, min: d.t_min, max: d.t_max },
    humidity: { avg: d.h_avg, min: d.h_min, max: d.h_max },
    vpd: { avg: d.v_avg, min: d.v_min, max: d.v_max },
  }));

  return json({
    overall: {
      samples: overall?.samples ?? 0,
      firstTs: overall?.first_ts ?? null,
      lastTs: overall?.last_ts ?? null,
      temp: { avg: overall?.t_avg ?? null, min: overall?.t_min ?? null, max: overall?.t_max ?? null },
      humidity: { avg: overall?.h_avg ?? null, min: overall?.h_min ?? null, max: overall?.h_max ?? null },
      vpd: { avg: overall?.v_avg ?? null, min: overall?.v_min ?? null, max: overall?.v_max ?? null },
    },
    days,
  });
}

// GET /api/grows/:id/env/day/:date → that day's minute readings (for a chart).
export async function getEnvDay(env, user, growId, date) {
  if (!(await ownsGrow(env, user.id, growId))) return error(404, "grow not found");
  await ensureEnvSchema(env);
  const res = await env.DB.prepare(
    "SELECT ts, temp_f, humidity, vpd FROM env_readings WHERE user_id = ? AND grow_id = ? AND date = ? ORDER BY ts"
  ).bind(user.id, growId, date).all();
  const readings = (res.results ?? []).map(r => ({
    ts: r.ts, tempF: r.temp_f, humidity: r.humidity, vpd: r.vpd,
  }));
  return json({ date, readings });
}

// DELETE /api/grows/:id/env → wipe all readings for the grow (re-import fresh).
export async function clearEnv(env, user, growId) {
  if (!(await ownsGrow(env, user.id, growId))) return error(404, "grow not found");
  await ensureEnvSchema(env);
  await env.DB.prepare(
    "DELETE FROM env_readings WHERE user_id = ? AND grow_id = ?"
  ).bind(user.id, growId).run();
  return json({ ok: true });
}
