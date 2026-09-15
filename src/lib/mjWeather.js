// The weather MJ is told about.
//
// Two rules decide this, and both were being broken.
//
// It is THIS grow's weather or it is nothing. The cache is keyed by
// coordinates, so a query that takes any row back gives a grower in one state
// the forecast for another, under a heading naming a third. A space with no
// location has no weather, and saying nothing is the honest answer.
//
// And what a space is decides how much of it matters. Outdoors the sky IS the
// record, so the whole forecast belongs in MJ's context. A tent makes its own
// climate and does not care what tomorrow's high is, but it very much cares
// about the ice storm that is going to take the power out, so an indoor space
// hears about severe weather and nothing else.
//
// Pure, so the rules are tested rather than hoped for.

/** Past this, a cached forecast is history and MJ is not told it is now. */
export const WEATHER_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Inside this, "now" really is now and needs no caveat. */
const FRESH_MS = 20 * 60 * 1000;

/** How long ago, in words a sentence can hold. "" when it is simply current. */
export function freshnessNote(updatedAt, now = Date.now()) {
  const t = Date.parse(updatedAt ?? "");
  if (!Number.isFinite(t)) return "";
  const age = now - t;
  if (age < FRESH_MS) return "";
  const mins = Math.round(age / 60000);
  if (mins < 90) return `as of ${mins} minutes ago`;
  return `as of ${Math.round(mins / 60)} hours ago`;
}

/** Is this cached reading recent enough to put in front of MJ at all? */
export function isUsable(updatedAt, now = Date.now()) {
  const t = Date.parse(updatedAt ?? "");
  return Number.isFinite(t) && now - t <= WEATHER_MAX_AGE_MS && now - t >= -60_000;
}

/**
 * The weather block for one grow's system prompt.
 *
 * `mode` is "full" for a space the sky writes the record for, "alerts" for one
 * that reads its own instruments. Returns "" when there is nothing worth
 * saying, which is a real answer: no location, a cold cache, or an indoor
 * space with no warnings out.
 */
export function weatherBlock({ location, hourly, alerts, updatedAt, mode = "full", now = Date.now() }) {
  const warnings = Array.isArray(alerts) ? alerts.slice(0, 3) : [];
  const alertLines = warnings.length
    ? ["  ACTIVE WEATHER ALERTS:", ...warnings.map(a => `    - ${a.event}: ${a.headline || a.severity || ""}`.trimEnd())]
    : [];

  // A tent hears about the storm and not the forecast.
  if (mode === "alerts") {
    if (!alertLines.length) return "";
    return [
      `WEATHER WHERE THIS SPACE IS${location ? ` (${location})` : ""}:`,
      "  This space reads its own instruments, so the forecast is not its climate. These warnings are here because power, access and the room around it are still outside.",
      ...alertLines,
    ].join("\n");
  }

  const fresh = isUsable(updatedAt, now);
  const note = fresh ? freshnessNote(updatedAt, now) : "";
  const lines = [];
  if (fresh && hourly) {
    const { periods, highLow } = hourly;
    if (highLow?.high != null || highLow?.low != null) {
      lines.push(`  Today: high ${highLow.high ?? "?"} F, low ${highLow.low ?? "?"} F`);
    }
    const current = periods?.[0];
    if (current) lines.push(`  Right now${note ? ` (${note})` : ""}: ${current.temp} F, ${current.shortForecast}`);
    const next = (periods ?? []).slice(1, 4);
    if (next.length) {
      lines.push(`  Next ${next.length}h: ${next.map(p => `${p.temp} F (${p.shortForecast})`).join(" then ")}`);
    }
  }
  if (!lines.length && !alertLines.length) return "";
  return [
    `WEATHER AT THIS GROW${location ? ` (${location})` : ""}:`,
    ...lines,
    ...alertLines,
  ].join("\n");
}
