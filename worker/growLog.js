import { json, error } from "./util.js";

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v) {
  if (!v || typeof v !== "string") return null;
  return v.trim().slice(0, 500) || null;
}

function rowToEntry(row) {
  return {
    water_gal: row.water_gal ?? null,
    feed:      row.feed      ?? null,
    temp_high: row.temp_high ?? null,
    temp_low:  row.temp_low  ?? null,
    humidity:  row.humidity  ?? null,
  };
}

function csvEscape(s) {
  const str = s == null ? "" : String(s);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function getGrowLog(env, user, date) {
  const row = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND date = ?"
  ).bind(user.id, date).first();
  return json({ date, entry: row ? rowToEntry(row) : null });
}

export async function putGrowLog(request, env, user, date) {
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const { water_gal, feed, temp_high, temp_low, humidity } = body ?? {};

  await env.DB.prepare(`
    INSERT INTO grow_log (user_id, date, water_gal, feed, temp_high, temp_low, humidity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, date) DO UPDATE SET
      water_gal  = excluded.water_gal,
      feed       = excluded.feed,
      temp_high  = excluded.temp_high,
      temp_low   = excluded.temp_low,
      humidity   = excluded.humidity,
      updated_at = excluded.updated_at
  `).bind(
    user.id, date,
    toNum(water_gal), toStr(feed), toNum(temp_high), toNum(temp_low), toNum(humidity)
  ).run();

  return json({ ok: true });
}

export async function exportGrowLogCsv(env, user) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? ORDER BY date ASC"
  ).bind(user.id).all();

  const header = "date,water_gal,feed,temp_high,temp_low,humidity\r\n";
  const rows = results.map(r =>
    [r.date, r.water_gal ?? "", csvEscape(r.feed), r.temp_high ?? "", r.temp_low ?? "", r.humidity ?? ""].join(",")
  ).join("\r\n");

  return new Response(header + rows, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="grow-log.csv"',
    },
  });
}
