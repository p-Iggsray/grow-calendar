// @ts-check
// Per-day observed weather (high/low/humidity/precip) for a grow's location,
// powering the journal's automatic Weather section and the auto-logged
// temp/humidity fields in the daily grow log.
//
// Source: Open-Meteo (free, no key, global). One call returns a window of
// past days + today + tomorrow, aggregated in the location's own timezone;
// every returned day is cached in weather_days so a month of journal pages
// costs at most one upstream call.
import { logError } from "./log.js";
import { ensureGrowLogSchema } from "./growLog.js";
import { geocode } from "./geocode.js";

const PAST_DAYS = 7; // each fetch backfills up to a week of gaps

let _schemaReady = false;
export async function ensureWeatherDaysSchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS weather_days (
      loc        TEXT NOT NULL,
      date       TEXT NOT NULL,
      high       REAL,
      low        REAL,
      humidity   REAL,
      precip     REAL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (loc, date)
    )
  `).run();
  _schemaReady = true;
}

// ~1km buckets so nearby grows share cached weather.
export function locKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

// Pure: coordinates from a grow survey, or null when none usable. Guards
// against null/"" coercing to 0 (which would silently mean the Gulf of Guinea).
export function coordsFromSurvey(survey) {
  const ok = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v));
  if (!ok(survey?.lat) || !ok(survey?.lon)) return null;
  return { lat: Number(survey.lat), lon: Number(survey.lon) };
}

// Pure: flatten Open-Meteo's parallel daily arrays into per-day records.
export function shapeOpenMeteoDaily(data) {
  const d = data?.daily;
  if (!d || !Array.isArray(d.time)) return [];
  const num = (arr, i) => {
    const v = arr?.[i];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  };
  return d.time.map((date, i) => ({
    date,
    high: num(d.temperature_2m_max, i),
    low: num(d.temperature_2m_min, i),
    humidity: num(d.relative_humidity_2m_mean, i),
    precip: num(d.precipitation_sum, i),
  })).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

// A cached row is "final" once it was written on a later calendar day than the
// day it describes (the day had ended, so its high/low can't change).
export function isFinalReading(row) {
  return Boolean(row?.updated_at && row.updated_at.slice(0, 10) > row.date);
}

async function fetchWindow(env, lat, lon) {
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat}&longitude=${lon}`
    + "&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum"
    + `&past_days=${PAST_DAYS}&forecast_days=2`
    + "&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const days = shapeOpenMeteoDaily(await res.json());
  if (days.length === 0) return {};

  const loc = locKey(lat, lon);
  const now = new Date().toISOString();
  await env.DB.batch(days.map(r =>
    env.DB.prepare(`
      INSERT INTO weather_days (loc, date, high, low, humidity, precip, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(loc, date) DO UPDATE SET
        high = excluded.high, low = excluded.low,
        humidity = excluded.humidity, precip = excluded.precip,
        updated_at = excluded.updated_at
    `).bind(loc, r.date, r.high, r.low, r.humidity, r.precip, now)
  ));
  return Object.fromEntries(days.map(r => [r.date, r]));
}

// Observed weather for one day at a location, or null when unavailable.
// Past days are cached forever once final; today refreshes every ~3 hours
// (its high/low are still moving). Best-effort: any upstream failure returns
// whatever is cached, else null - never throws.
export async function getWeatherForDay(env, lat, lon, date) {
  try {
    await ensureWeatherDaysSchema(env);
    const loc = locKey(lat, lon);
    const row = await env.DB.prepare(
      "SELECT * FROM weather_days WHERE loc = ? AND date = ?"
    ).bind(loc, date).first();

    const today = new Date().toISOString().slice(0, 10);
    const fresh = row && (
      isFinalReading(row) ||
      Date.now() - new Date(row.updated_at).getTime() < 3 * 60 * 60 * 1000
    );
    if (fresh) return shapeRow(row);

    // Only the fetch window (last PAST_DAYS + tomorrow) can be filled from the
    // API; older uncached days stay null rather than triggering a call that
    // cannot cover them.
    const oldest = new Date(today + "T12:00:00Z");
    oldest.setUTCDate(oldest.getUTCDate() - PAST_DAYS);
    if (date < oldest.toISOString().slice(0, 10)) return row ? shapeRow(row) : null;

    // Upstream failure must not lose a stale-but-real cached reading.
    let fetched = {};
    try { fetched = await fetchWindow(env, lat, lon); }
    catch (err) { logError("weather-fetch-failed", { message: String(err?.message) }); }
    return fetched[date] ?? (row ? shapeRow(row) : null);
  } catch (err) {
    logError("weather-day-failed", { message: String(err?.message) });
    return null;
  }
}

function shapeRow(row) {
  return { date: row.date, high: row.high, low: row.low, humidity: row.humidity, precip: row.precip };
}

// Pure: what the auto-logger should write for a grow_log row. Only fills
// blanks - a value the grower typed is never overwritten - and reports
// whether anything would change.
export function mergeAutoWeather(row, wx) {
  if (!wx || (wx.high == null && wx.low == null && wx.humidity == null)) return null;
  const fields = {};
  if ((row?.temp_high ?? null) == null && wx.high != null) fields.temp_high = wx.high;
  if ((row?.temp_low ?? null) == null && wx.low != null) fields.temp_low = wx.low;
  if ((row?.humidity ?? null) == null && wx.humidity != null) fields.humidity = wx.humidity;
  return Object.keys(fields).length ? fields : null;
}

// Nightly/daily sweep: for every active outdoor/greenhouse grow with a
// location, write yesterday's and today's observed weather into the daily log
// wherever the grower left those fields blank. Rows CREATED by this sweep are
// flagged auto_weather=1 so they never count as "day logged" (the green ring
// and journal timeline stay meaningful); any manual edit clears the flag.
export async function autoLogWeather(env) {
  await ensureGrowLogSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT id, user_id, survey FROM grows WHERE status = 'active' AND config IS NOT NULL LIMIT 200"
  ).all();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const y = new Date(today + "T12:00:00Z");
  y.setUTCDate(y.getUTCDate() - 1);
  const dates = [y.toISOString().slice(0, 10), today];

  let written = 0;
  for (const g of results ?? []) {
    let survey;
    try { survey = g.survey ? JSON.parse(g.survey) : null; } catch { survey = null; }
    if (!survey || survey.environment === "indoor") continue;
    let coords = coordsFromSurvey(survey);
    // A typed place name without coordinates geocodes once, then persists.
    if (!coords && (survey.location ?? "").trim()) {
      const geo = await geocode(survey.location).catch(() => null);
      if (geo) {
        coords = geo;
        survey.lat = geo.lat;
        survey.lon = geo.lon;
        try {
          await env.DB.prepare(
            "UPDATE grows SET survey = ? WHERE id = ? AND user_id = ?"
          ).bind(JSON.stringify(survey), g.id, g.user_id).run();
        } catch { /* next run retries */ }
      }
    }
    if (!coords) continue;

    for (const date of dates) {
      const wx = await getWeatherForDay(env, coords.lat, coords.lon, date);
      const row = await env.DB.prepare(
        "SELECT temp_high, temp_low, humidity FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?"
      ).bind(g.user_id, g.id, date).first();
      const fields = mergeAutoWeather(row, wx);
      if (!fields) continue;

      if (row) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(", ");
        await env.DB.prepare(
          `UPDATE grow_log SET ${sets}, updated_at = datetime('now') WHERE user_id = ? AND grow_id = ? AND date = ?`
        ).bind(...Object.values(fields), g.user_id, g.id, date).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO grow_log (user_id, grow_id, date, temp_high, temp_low, humidity, auto_weather, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `).bind(g.user_id, g.id, date, fields.temp_high ?? null, fields.temp_low ?? null, fields.humidity ?? null).run();
      }
      written++;
    }
  }
  return written;
}
