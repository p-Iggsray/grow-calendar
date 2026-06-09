// @ts-check
import { json } from "./util.js";
import { logError } from "./log.js";
import { geocode } from "./geocode.js";

const POINT_TTL_MS = 24 * 60 * 60 * 1000; // gridpoint rarely changes
const CACHE_TTL_MS = 10 * 60 * 1000;       // alerts + hourly refreshed every 10 min

const NWS = { "User-Agent": "grow-calendar/1.0", Accept: "application/geo+json" };

async function nwsFetch(url) {
  const res = await fetch(url, { headers: NWS });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  return res.json();
}

async function dbGet(env, key, ttlMs) {
  const row = await env.DB.prepare(
    "SELECT value, updated_at FROM weather_cache WHERE key = ?"
  ).bind(key).first();
  if (!row) return null;
  if (new Date(row.updated_at).getTime() + ttlMs < Date.now()) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

async function dbSet(env, key, value) {
  await env.DB.prepare(`
    INSERT INTO weather_cache (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

async function getGridpoint(env, lat, lon) {
  const key = `weather:point:${lat},${lon}`;
  const cached = await dbGet(env, key, POINT_TTL_MS);
  if (cached) return cached;
  const data = await nwsFetch(`https://api.weather.gov/points/${lat},${lon}`);
  const { gridId, gridX, gridY } = data.properties;
  const gp = { gridId, gridX, gridY };
  await dbSet(env, key, gp);
  return gp;
}

function shapeAlerts(data) {
  return (data?.features ?? []).slice(0, 5).map(f => ({
    id: f.properties.id,
    event: f.properties.event,
    headline: f.properties.headline,
    severity: f.properties.severity,   // Extreme / Severe / Moderate / Minor
    urgency: f.properties.urgency,
    expires: f.properties.expires,
  }));
}

function shapeHourly(data) {
  const periods = data?.properties?.periods ?? [];
  const cutoff = Date.now() - 30 * 60 * 1000;
  return periods
    .filter(p => new Date(p.startTime).getTime() >= cutoff)
    .slice(0, 12)
    .map(p => ({
      startTime: p.startTime,
      temp: p.temperature,
      tempUnit: p.temperatureUnit,
      windSpeed: p.windSpeed,
      shortForecast: p.shortForecast,
      isDaytime: p.isDaytime,
    }));
}

function shapeHighLow(data) {
  const periods = data?.properties?.periods ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const temps = periods
    .filter(p => p.startTime.startsWith(todayStr))
    .map(p => p.temperature);
  if (temps.length === 0) return { high: null, low: null };
  return { high: Math.max(...temps), low: Math.min(...temps) };
}

// Resolve a grow's coordinates. Uses stored survey.lat/lon when present,
// otherwise geocodes the survey's free-text location once and persists the
// result so it's only looked up a single time. Returns null when no usable
// location is on file. Note: forecasts come from the US National Weather
// Service, so coordinates outside the US simply yield no data (handled below).
async function resolveGrowCoords(env, user, growId) {
  let row;
  if (growId) {
    row = await env.DB.prepare(
      "SELECT id, survey FROM grows WHERE id = ? AND user_id = ?"
    ).bind(growId, user.id).first();
  }
  if (!row) {
    row = await env.DB.prepare(
      "SELECT id, survey FROM grows WHERE user_id = ? ORDER BY (status = 'active') DESC, updated_at DESC LIMIT 1"
    ).bind(user.id).first();
  }
  if (!row) return null;

  let survey;
  try { survey = row.survey ? JSON.parse(row.survey) : null; } catch { survey = null; }
  if (!survey) return null;

  const lat = Number(survey.lat);
  const lon = Number(survey.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };

  const geo = await geocode(survey.location);
  if (!geo) return null;

  survey.lat = geo.lat;
  survey.lon = geo.lon;
  try {
    await env.DB.prepare(
      "UPDATE grows SET survey = ? WHERE id = ? AND user_id = ?"
    ).bind(JSON.stringify(survey), row.id, user.id).run();
  } catch (err) {
    logError("weather-coord-persist-failed", { message: String(err?.message) });
  }
  return geo;
}

export async function getWeather(request, env, user) {
  const url = new URL(request.url);
  const growId = url.searchParams.get("growId") || null;

  const coords = await resolveGrowCoords(env, user, growId);
  // No location on file (or geocoding failed) — return empty so the UI hides
  // the weather card rather than showing the wrong city's forecast.
  if (!coords) {
    return json({ alerts: [], hourly: [], highLow: { high: null, low: null } });
  }
  const { lat, lon } = coords;

  const alertsKey = `weather:alerts:${lat},${lon}`;
  const hourlyKey = `weather:hourly:${lat},${lon}`;

  let [alerts, hourlyCache] = await Promise.all([
    dbGet(env, alertsKey, CACHE_TTL_MS),
    dbGet(env, hourlyKey, CACHE_TTL_MS),
  ]);

  try {
    if (!alerts) {
      const raw = await nwsFetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`);
      alerts = shapeAlerts(raw);
      await dbSet(env, alertsKey, alerts);
    }

    if (!hourlyCache) {
      const gp = await getGridpoint(env, lat, lon);
      const raw = await nwsFetch(
        `https://api.weather.gov/gridpoints/${gp.gridId}/${gp.gridX},${gp.gridY}/forecast/hourly`
      );
      hourlyCache = { periods: shapeHourly(raw), highLow: shapeHighLow(raw) };
      await dbSet(env, hourlyKey, hourlyCache);
    }
  } catch (err) {
    logError("weather-fetch-failed", { message: String(err?.message) });
    // Return whatever we have — partial data is better than an error page.
  }

  return json({
    alerts: alerts ?? [],
    hourly: hourlyCache?.periods ?? [],
    highLow: hourlyCache?.highLow ?? { high: null, low: null },
  });
}
