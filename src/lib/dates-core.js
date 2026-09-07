// Pure date helpers. No React, no DOM - safe to import in the Cloudflare Worker.
export function getToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

// ISO YYYY-MM-DD parsed as a LOCAL date. `new Date("2026-05-05")` would parse
// as UTC and shift the day in western timezones.
export function parseDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * A span of days said the way a grower counts it: "3 weeks and 3 days".
 *
 * Past a fortnight a raw day count stops meaning anything - nobody reads "24
 * days" and thinks "three and a half weeks" without stopping to divide. Weeks
 * are how a grow is actually paced, so that is how a phase's length is told.
 *
 * A whole number of weeks drops the days ("2 weeks", not "2 weeks and 0 days")
 * and anything under a week is just days, so the short spans stay short.
 */
export function weeksAndDays(days) {
  const n = typeof days === "number" ? days : parseInt(days, 10);
  if (!Number.isFinite(n) || n < 0) return "";
  const plural = (v, word) => `${v} ${word}${v === 1 ? "" : "s"}`;
  const weeks = Math.floor(n / 7);
  const rest = n % 7;
  if (weeks === 0) return plural(n, "day");
  if (rest === 0) return plural(weeks, "week");
  return `${plural(weeks, "week")} and ${plural(rest, "day")}`;
}

export const fmt  = d => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
export const fmtL = d => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
