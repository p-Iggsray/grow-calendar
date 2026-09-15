// @ts-check
// System-prompt context builders: grow log, weather, stats, grows list.
import { displayUnit, formatWater, rowDisplay, unitLabel } from "../../src/lib/waterUnits.js";
import { cropOf, words } from "../../src/lib/crops.js";
import { autoLogsWeather } from "../../src/lib/growEnvironment.js";
import { logError } from "../log.js";
import { weatherBlock } from "../../src/lib/mjWeather.js";

function tryParseArr(s) {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

export async function buildGrowLogContext(env, userId, growId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const res = await env.DB.prepare(
    `SELECT date, water_gal, feed, temp_high, temp_low, humidity, water_plants
     FROM grow_log
     WHERE user_id = ? AND grow_id = ? AND date >= ?
     ORDER BY date DESC`
  ).bind(userId, growId, cutoffStr).all();

  const rows = res.results ?? [];
  if (rows.length === 0) return "RECENT GROW LOG (last 14 days): No entries recorded yet.";

  const lines = ["RECENT GROW LOG (last 14 days):"];
  for (const r of rows) {
    const parts = [];
    // A day reads back in the unit it was watered in, and says which plant got
    // what, so MJ answers in the grower's own measure rather than in gallons.
    const waterRows = tryParseArr(r.water_plants);
    if (waterRows.length) {
      const each = waterRows.map((w) => {
        const { amount, unit } = rowDisplay(w);
        return { who: w?.plant || "all plants", amount, unit };
      });
      // A whole tent watered the same is one short phrase, not fifteen.
      const same = each.every((w) => w.amount != null && w.amount === each[0].amount && w.unit === each[0].unit);
      parts.push(same && each.length > 1
        ? `water: ${each.length} plants, ${each[0].amount} ${unitLabel(each[0].unit)} each`
        : `water: ${each.map((w) => (w.amount == null ? w.who : `${w.who} ${w.amount} ${unitLabel(w.unit)}`)).join("; ")}`);
      if (r.water_gal != null) {
        parts.push(`${formatWater(r.water_gal, displayUnit(waterRows))} total`);
      }
    } else if (r.water_gal != null) {
      parts.push(`${r.water_gal} gal water`);
    }
    if (r.temp_high != null || r.temp_low != null) {
      parts.push(`temp ${r.temp_high ?? "?"}°/${r.temp_low ?? "?"}°F`);
    }
    if (r.humidity != null) parts.push(`${r.humidity}% RH`);
    if (r.feed) parts.push(`feed: ${r.feed}`);
    lines.push(`  ${r.date}: ${parts.length > 0 ? parts.join(", ") : "(no fields logged)"}`);
  }
  return lines.join("\n");
}

/**
 * This grow's weather, and only this grow's.
 *
 * The cache is keyed by coordinates. Reading it without them (which is what
 * this did) hands back whichever row happens to come first, so a grower could
 * be told another location's forecast under a hard-coded heading naming a
 * third. Coordinates come off the survey the caller already loaded, so there
 * is no extra query and no geocoding round trip in front of a reply.
 *
 * Cache-only on purpose. The weather card warms it whenever the calendar is
 * open; making MJ wait on the National Weather Service would put an external
 * request in front of every first message of a session.
 */
export async function buildWeatherContext(env, survey) {
  const lat = Number(survey?.lat);
  const lon = Number(survey?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";

  try {
    const key = `${lat},${lon}`;
    const [hourlyRow, alertRow] = await Promise.all([
      env.DB.prepare("SELECT value, updated_at FROM weather_cache WHERE key = ?")
        .bind(`weather:hourly:${key}`).first(),
      env.DB.prepare("SELECT value, updated_at FROM weather_cache WHERE key = ?")
        .bind(`weather:alerts:${key}`).first(),
    ]);

    const parse = (row) => {
      if (!row?.value) return null;
      try { return JSON.parse(row.value); } catch { return null; }
    };

    return weatherBlock({
      location: typeof survey?.location === "string" ? survey.location : null,
      hourly: parse(hourlyRow),
      alerts: parse(alertRow),
      updatedAt: hourlyRow?.updated_at ?? alertRow?.updated_at ?? null,
      mode: autoLogsWeather(survey?.environment) ? "full" : "alerts",
    });
  } catch (e) {
    // Losing a context block costs MJ knowledge without costing the reply, so
    // it fails soft. Silently is a different matter: that is how a broken
    // block goes unnoticed for months.
    logError("mj-context-weather", { message: String(e?.message ?? e) });
    return "";
  }
}

export async function buildStatsContext(env, userId, growId) {
  try {
    const logRow = await env.DB.prepare(`
      SELECT
        ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
        COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days,
        COUNT(*) AS log_days
      FROM grow_log WHERE user_id = ? AND grow_id = ?
    `).bind(userId, growId).first();
    if (!logRow) return "";

    // Gallons are what the total is STORED in, never necessarily what it was
    // measured in. MJ is told not to convert a grower's own measure, so the
    // season total has to come back in the unit the season was logged in.
    const unitRes = await env.DB.prepare(
      "SELECT water_plants FROM grow_log WHERE user_id = ? AND grow_id = ? AND water_plants IS NOT NULL"
    ).bind(userId, growId).all();
    const rows = (unitRes.results ?? []).flatMap((r) => tryParseArr(r.water_plants));
    // No fallback: with nothing to go on, displayUnit(rows, null) says so
    // rather than inventing gallons.
    const unit = displayUnit(rows, null);

    const lines = ["SEASON STATS:"];
    const total = Number(logRow.total_water ?? 0);
    lines.push(unit
      ? `  Total water logged: ${formatWater(total, unit)} over ${logRow.log_days ?? 0} days`
      : `  Days with a log entry: ${logRow.log_days ?? 0}`);
    lines.push(`  Feed days recorded: ${logRow.feed_days ?? 0}`);
    return lines.join("\n");
  } catch (e) {
    logError("mj-context-stats", { message: String(e?.message ?? e) });
    return "";
  }
}

// Imported sensor data (controller CSV) in one compact block so MJ answers
// environment questions with real numbers without a tool call.
export async function buildEnvContext(env, userId, growId) {
  try {
    const overall = await env.DB.prepare(
      `SELECT COUNT(*) AS samples, ROUND(AVG(temp_f),1) AS t_avg, ROUND(AVG(humidity),1) AS h_avg, ROUND(AVG(vpd),2) AS v_avg
       FROM env_readings WHERE user_id = ? AND grow_id = ?`
    ).bind(userId, growId).first();
    if (!overall || Number(overall.samples) === 0) return "";
    const recent = await env.DB.prepare(
      `SELECT date, ROUND(AVG(temp_f),1) AS t, ROUND(AVG(humidity),1) AS h, ROUND(AVG(vpd),2) AS v
       FROM env_readings WHERE user_id = ? AND grow_id = ? GROUP BY date ORDER BY date DESC LIMIT 3`
    ).bind(userId, growId).all();
    const lines = [`SENSOR DATA (imported controller readings, ${overall.samples} minutes total; averages ${overall.t_avg} F, ${overall.h_avg}% RH, ${overall.v_avg} kPa VPD):`];
    for (const d of recent.results ?? []) {
      lines.push(`  ${d.date}: avg ${d.t} F, ${d.h}% RH, ${d.v} kPa`);
    }
    lines.push("  (use get_environment for full history or a specific day)");
    return lines.join("\n");
  } catch (e) {
    logError("mj-context-env", { message: String(e?.message ?? e) });
    return "";
  }
}

// Compact roster line with per-plant stages so MJ knows where each plant is.
export function buildRosterContext(survey) {
  const plants = Array.isArray(survey?.strains) ? survey.strains.filter(p => (p.status ?? "growing") === "growing") : [];
  if (plants.length === 0) return "";
  const w = words(cropOf(survey));
  const parts = plants.slice(0, 12).map(p => `${p.name || "Unnamed"}${p.stage ? ` [${p.stage}]` : ""}`);
  return `${w.Units.toUpperCase()} IN THIS SPACE: ${parts.join(", ")}${plants.length > 12 ? ` and ${plants.length - 12} more` : ""}.`;
}

export function buildGrowsContext(grows, activeGrowId) {
  if (!grows || grows.length <= 1) return "";
  const lines = ["ALL GROWER'S GROWS:"];
  for (const g of grows) {
    const isActive = g.id === activeGrowId;
    const strains = g.survey?.strains?.map(s => s.name).filter(Boolean).join(" × ") || "";
    const statusLabel = g.status === "active" ? "active" : g.status;
    lines.push(`  - "${g.displayName}" [${statusLabel}]${strains ? ` - ${strains}` : ""}${isActive ? " ← ACTIVE GROW (calendar context)" : ""}`);
  }
  lines.push("When asked about a specific grow other than the active one, acknowledge which one you're discussing.");
  return lines.join("\n");
}
