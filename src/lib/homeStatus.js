// What the home screen leads with, folded out of the journal's own timeline.
//
// The rule is the same one the calendar follows: every value here is a day
// somebody actually wrote down. Nothing is averaged into a trend, projected
// forward, or filled in from a plan. If a space has never been watered, the
// answer is "never", not an estimate.
//
// Pure - no React, no fetching - so it is tested directly.

import { words } from "./crops.js";

/**
 * What a space grows, in a few words, for the line above its name.
 *
 * The stage and the day count used to sit there. They moved to the status card
 * when it arrived, and repeating them in both places only spent the line twice,
 * so it now carries the one thing neither the card nor the title says.
 */
export function spaceSubtitle(survey) {
  const names = [...new Set((survey?.strains ?? [])
    .filter((p) => (p?.status ?? "growing") === "growing")
    .map((p) => String(p?.name ?? "").trim())
    .filter(Boolean))];
  if (names.length === 0) return words(survey).cropLabel;
  if (names.length <= 2) return names.join(" · ");
  return `${names[0]} +${names.length - 1} more`;
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// The last day water went in. Zero gallons is not a watering: a day whose log
// was opened and left blank should not count as one.
function wateringOf(day) {
  const gal = num(day?.log?.water_gal);
  if (gal == null || gal <= 0) return null;
  return {
    date: day.date,
    gal,
    // The unit the day was logged in travels with it, so a tub misted in
    // millilitres is never read back as a fraction of a gallon.
    unit: day.log.water_unit ?? null,
    waterings: num(day.log.waterings) ?? 0,
  };
}

// The last climate reading. A space's own log wins over the weather service:
// a tent's thermometer knows the tent, and the forecast does not. An outdoor
// space logs nothing itself, so its reading is the one written in for it.
function climateOf(day) {
  for (const [src, from] of [["log", day?.log], ["weather", day?.weather]]) {
    const high = num(from?.temp_high ?? from?.high);
    const low = num(from?.temp_low ?? from?.low);
    const humidity = num(from?.humidity);
    if (high != null || low != null || humidity != null) {
      return { date: day.date, high, low, humidity, source: src };
    }
  }
  return null;
}

/**
 * The most recent watering and the most recent climate reading in a set of
 * timeline days, each with the day it happened on.
 *
 * The two are found independently, because they rarely land on the same day:
 * you might mist on Tuesday and take a reading on Thursday, and the card
 * should say so rather than reporting only whichever day held both.
 */
export function summariseStatus(days) {
  // Newest first, whatever order they arrive in.
  const list = [...(Array.isArray(days) ? days : [])]
    .filter((d) => d?.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  let water = null;
  let climate = null;
  for (const day of list) {
    if (!water) water = wateringOf(day);
    if (!climate) climate = climateOf(day);
    if (water && climate) break;
  }
  return { water, climate };
}

/**
 * "today" / "yesterday" / "3 days ago" / "12 Aug" for a recorded day.
 *
 * Anything inside the last week reads as a count of days, because that is how
 * a grower thinks about it. Older than that and the date itself is more use.
 */
export function whenLabel(dateKey, todayKey) {
  if (!dateKey || !todayKey) return "";
  const [y1, m1, d1] = String(dateKey).split("-").map(Number);
  const [y2, m2, d2] = String(todayKey).split("-").map(Number);
  if (!y1 || !y2) return "";
  const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days < 0) return "later";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d1} ${months[m1 - 1] ?? ""}`.trim();
}
