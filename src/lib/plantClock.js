// How old each plant is, how long it has spent in each stage, and when the
// breeder says it should be ready. Pure, and shared by the app, the worker and
// the tests, so every screen agrees about the same plant.
//
// Ages and stage lengths are history: they come from the plant's start date and
// its recorded stage switches. The harvest window is the one forecast the app
// makes, and it is the breeder's, not a calendar's: a photoperiod plant's clock
// starts the day it is moved to Flowering, an autoflower's the day it was
// started, and the window is the breeder's minimum to maximum weeks from there.
import { ALL_STAGES, CROP_STAGES, cropOf, words } from "./crops.js";

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CANNABIS = CROP_STAGES.cannabis;
const FLOWER_INDEX = CANNABIS.indexOf("flowering");
const HARVEST_INDEX = CANNABIS.indexOf("harvest");

// The breeder's numbers. A photoperiod breeder quotes flowering time, an
// autoflower breeder quotes seed to harvest, so the two get their own ranges.
export const BREEDER_WEEKS = Object.freeze({
  photo: { min: 6, max: 16, defaultMin: 8, defaultMax: 10 },
  auto: { min: 6, max: 20, defaultMin: 10, defaultMax: 12 },
});

/** Pure: is this a usable YYYY-MM-DD key? */
export function isDateKey(value) {
  return typeof value === "string" && DATE_RE.test(value);
}

function keyToUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Pure: a date key moved by whole days. */
export function addDays(key, days) {
  if (!isDateKey(key)) return null;
  return utcToKey(keyToUtc(key) + Math.round(days) * DAY_MS);
}

/** Pure: whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetweenKeys(from, to) {
  if (!isDateKey(from) || !isDateKey(to)) return null;
  return Math.round((keyToUtc(to) - keyToUtc(from)) / DAY_MS);
}

/** Pure: "9w 1d", "3d", "2w". The compact form, for chips and cards. */
export function shortWeeks(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) return "";
  const weeks = Math.floor(n / DAYS_PER_WEEK);
  const rest = n % DAYS_PER_WEEK;
  if (weeks === 0) return `${rest}d`;
  return rest === 0 ? `${weeks}w` : `${weeks}w ${rest}d`;
}

/** Pure: "Dec 1". */
export function shortDate(key) {
  if (!isDateKey(key)) return "";
  const [, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Pure: "Dec 1 to 15", "Nov 28 to Dec 12", "Dec 1". */
export function rangeLabel(start, end) {
  if (!isDateKey(start)) return "";
  if (!isDateKey(end) || end === start) return shortDate(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${shortDate(start)} to ${Number(end.slice(8))}`
    : `${shortDate(start)} to ${shortDate(end)}`;
}

// ── Reading switches out of a log ───────────────────────────────────────────

// Stage ids, not display labels: the two crops share labels ("Harvest").
const LABEL_TO_STAGE = Object.fromEntries(ALL_STAGES.map((s) => [s.toLowerCase(), s]));

/**
 * Pure: the stage a plant_log row switched to. New rows carry it in `detail`
 * (an object, or the JSON of one); older ones only have the display body
 * ("Stage -> Flowering"), so the label is read off its end.
 */
export function stageFromLogRow(row) {
  if (row?.detail) {
    try {
      const parsed = typeof row.detail === "string" ? JSON.parse(row.detail) : row.detail;
      const s = String(parsed?.stage ?? "").toLowerCase();
      if (LABEL_TO_STAGE[s]) return LABEL_TO_STAGE[s];
    } catch { /* fall through to the body */ }
  }
  const tail = String(row?.body ?? "").split(/[>\u2192]/).pop();
  return LABEL_TO_STAGE[String(tail ?? "").trim().toLowerCase()] ?? null;
}

/** Pure: one plant's stage switches, from its own log entries. */
export function stageRecordsFromLog(entries, plantId) {
  return (entries ?? [])
    .filter((e) => (e?.kind ?? "") === "stage")
    .map((e) => ({ date: e.date, stage: stageFromLogRow(e), plantId }))
    .filter((r) => r.stage);
}

// ── A plant's own clock ─────────────────────────────────────────────────────

/**
 * Pure: the day this plant's life is counted from. `startedOn` is the day the
 * grower says it really started, which can be before it was added to the app;
 * without one it is the day it was added, and without that the space's day 0.
 */
export function plantStartDate(plant, fallback = null) {
  if (isDateKey(plant?.startedOn)) return plant.startedOn;
  if (isDateKey(plant?.createdAt)) return plant.createdAt;
  return isDateKey(fallback) ? fallback : null;
}

/** Pure: days old on `dateKey`, counting the start day as day 0. Null before it. */
export function plantAge(plant, dateKey, fallback = null) {
  const start = plantStartDate(plant, fallback);
  const days = daysBetweenKeys(start, dateKey);
  return days == null || days < 0 ? null : days;
}

/**
 * Pure: every stage this plant has been in, oldest first, as
 * `{ stage, start, end }` where `end` is the day it moved on (null for the
 * stage it is in now).
 *
 * `records` are recorded switches, `{ date, stage, plantId }`, for any plants:
 * only this plant's are read. Stages only move forward, so a record behind one
 * already seen is ignored, and one dated before the plant's start is pulled up
 * to the start rather than dropped. A plant from before switches were recorded
 * has none at all, and is shown in its current stage from its start date.
 */
export function plantStageSpans(plant, records, fallback = null) {
  const start = plantStartDate(plant, fallback);
  const own = (records ?? [])
    .filter((r) => r && r.plantId === plant?.id && isDateKey(r.date) && ALL_STAGES.includes(r.stage))
    .map((r) => ({ date: start && r.date < start ? start : r.date, stage: r.stage }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const spans = [];
  let best = -1;
  for (const r of own) {
    const i = ALL_STAGES.indexOf(r.stage);
    if (i <= best) continue;
    best = i;
    const last = spans[spans.length - 1];
    if (last && last.start === r.date) { last.stage = r.stage; continue; }
    if (last) last.end = r.date;
    spans.push({ stage: r.stage, start: r.date, end: null });
  }
  if (!spans.length && start && ALL_STAGES.includes(plant?.stage)) {
    spans.push({ stage: plant.stage, start, end: null });
  }
  return spans;
}

/** Pure: how many days a span lasted, or has lasted so far as of `todayKey`. */
export function spanDays(span, todayKey) {
  const days = daysBetweenKeys(span?.start, span?.end ?? todayKey);
  return days == null || days < 0 ? null : days;
}

/** Pure: the span holding `dateKey`, or null when the plant was not yet started. */
export function spanOn(spans, dateKey) {
  let found = null;
  for (const s of spans ?? []) {
    if (s.start > dateKey) break;
    found = s;
  }
  return found;
}

// ── The breeder's window ────────────────────────────────────────────────────

/** Pure: is this plant an autoflower? */
export function isAuto(plant) {
  return plant?.photo === false;
}

/**
 * Pure: the breeder's minimum and maximum weeks for this plant. `flowerWeeks`
 * is the minimum (the field predates the range); `flowerWeeksMax` is the
 * maximum, and a plant without one has a one-week-wide range of its minimum.
 */
export function breederWeeks(plant) {
  const limits = isAuto(plant) ? BREEDER_WEEKS.auto : BREEDER_WEEKS.photo;
  const rawMin = Number(plant?.flowerWeeks);
  if (!(Number.isFinite(rawMin) && rawMin > 0)) return { min: limits.defaultMin, max: limits.defaultMax };
  const min = Math.round(rawMin);
  const rawMax = Number(plant?.flowerWeeksMax);
  const max = Number.isFinite(rawMax) && rawMax >= min ? Math.round(rawMax) : min;
  return { min, max };
}

/** Pure: "8 to 10 wk", or "9 wk" when the breeder gives one number. */
export function weeksRangeLabel({ min, max }) {
  return max > min ? `${min} to ${max} wk` : `${min} wk`;
}

/**
 * Pure: when this plant should be ready, by the breeder's numbers.
 *
 * Null for anything that is not a cannabis plant. Otherwise one of:
 *   { pending: true, ... }   a photoperiod not yet flipped: no dates exist yet
 *   { start, end, anchor, ... }   the window, counted from `anchor`
 * `harvestedOn` is set once the plant has reached Harvest. `start` is the
 * plant's start date, which is what an autoflower counts from.
 */
export function harvestWindow(plant, spans, crop, start = null) {
  if (cropOf(crop) !== "cannabis") return null;
  const weeks = breederWeeks(plant);
  const auto = isAuto(plant);
  const reached = (index) => (spans ?? []).find((s) => CANNABIS.indexOf(s.stage) >= index) ?? null;
  const harvested = reached(HARVEST_INDEX);
  const anchor = auto
    ? (isDateKey(start) ? start : spans?.[0]?.start ?? null)
    : reached(FLOWER_INDEX)?.start ?? null;
  const base = { auto, minWeeks: weeks.min, maxWeeks: weeks.max, harvestedOn: harvested?.start ?? null };
  if (!anchor) return { ...base, pending: true, anchor: null, start: null, end: null };
  return {
    ...base,
    pending: false,
    anchor,
    start: addDays(anchor, weeks.min * DAYS_PER_WEEK),
    end: addDays(anchor, weeks.max * DAYS_PER_WEEK),
  };
}

/**
 * Pure: where a plant stands against its window on `todayKey`.
 *   phase: "pending" | "before" | "open" | "past" | "harvested"
 *   progress: 0..1 from the anchor to the end of the window, for a bar
 */
export function harvestStatus(window, todayKey) {
  if (!window) return null;
  if (window.harvestedOn) return { phase: "harvested", on: window.harvestedOn };
  if (window.pending) return { phase: "pending" };
  const toStart = daysBetweenKeys(todayKey, window.start);
  const toEnd = daysBetweenKeys(todayKey, window.end);
  const total = daysBetweenKeys(window.anchor, window.end);
  const elapsed = daysBetweenKeys(window.anchor, todayKey);
  const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 1;
  if (toStart > 0) return { phase: "before", daysToStart: toStart, daysToEnd: toEnd, progress };
  if (toEnd >= 0) {
    return {
      phase: "open", daysLeft: toEnd, progress,
      dayOfWindow: -toStart + 1, windowDays: daysBetweenKeys(window.start, window.end) + 1,
    };
  }
  return { phase: "past", daysPast: -toEnd, progress };
}

/** Pure: one line for a plant's harvest, e.g. "Harvest Dec 1 to 15, in 18 to 32 days". */
export function harvestLine(window, todayKey) {
  const status = harvestStatus(window, todayKey);
  if (!status) return "";
  const range = rangeLabel(window.start, window.end);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  switch (status.phase) {
    case "harvested":
      return `Harvested ${shortDate(status.on)}`;
    case "pending":
      return `Harvest ${weeksRangeLabel({ min: window.minWeeks, max: window.maxWeeks })} after flip`;
    case "before":
      return status.daysToEnd > status.daysToStart
        ? `Harvest ${range}, in ${status.daysToStart} to ${plural(status.daysToEnd, "day")}`
        : `Harvest ${range}, in ${plural(status.daysToStart, "day")}`;
    case "open":
      return status.daysLeft > 0
        ? `In harvest window, up to ${plural(status.daysLeft, "more day")}`
        : "In harvest window, last day";
    default:
      return `${plural(status.daysPast, "day")} past the harvest window`;
  }
}

// ── A whole space at once ───────────────────────────────────────────────────

/**
 * Pure: everything about one plant, worked out once:
 * `{ plant, start, age, spans, current, inStage, window, status }`.
 */
export function plantClock(plant, records, { todayKey, crop, fallback = null } = {}) {
  const start = plantStartDate(plant, fallback);
  const spans = plantStageSpans(plant, records, fallback);
  const current = spans[spans.length - 1] ?? null;
  const window = harvestWindow(plant, spans, crop, start);
  return {
    plant,
    start,
    age: plantAge(plant, todayKey, fallback),
    spans,
    current,
    inStage: current ? spanDays(current, todayKey) : null,
    window,
    status: harvestStatus(window, todayKey),
  };
}

/** Pure: a clock for every growing plant in a space. */
export function plantClocks(plants, records, options = {}) {
  return (plants ?? [])
    .filter((p) => (p?.status ?? "growing") === "growing")
    .map((plant) => plantClock(plant, records, options));
}

/**
 * Pure: the distinct harvest windows in a space, each with the plants it
 * belongs to. Plants sharing a start and end (the same strain flipped the same
 * day) collapse into one. Pending and harvested plants have no dates to show.
 */
export function windowGroups(clocks) {
  const groups = new Map();
  for (const c of clocks ?? []) {
    const w = c.window;
    if (!w || w.pending || w.harvestedOn) continue;
    const key = `${w.start}|${w.end}`;
    if (!groups.has(key)) groups.set(key, { start: w.start, end: w.end, plants: [] });
    groups.get(key).plants.push(c.plant);
  }
  return [...groups.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Pure: the windows that hold `dateKey`. */
export function windowsOn(groups, dateKey) {
  return (groups ?? []).filter((g) => g.start <= dateKey && dateKey <= g.end);
}

/** Pure: the plant whose harvest comes first, for a one-line summary. */
export function soonestHarvest(clocks) {
  const live = (clocks ?? []).filter((c) => c.window && !c.window.pending && !c.window.harvestedOn);
  live.sort((a, b) => (a.window.start < b.window.start ? -1 : a.window.start > b.window.start ? 1 : 0));
  return live[0] ?? null;
}

/** Pure: the label for the breeder field, which counts differently per type. */
export function breederFieldLabel(plant, crop) {
  if (cropOf(crop) !== "cannabis") return words(crop).lengthLabel;
  return isAuto(plant) ? "Seed to harvest (breeder)" : "Flowering time (breeder)";
}

/**
 * Pure: a breeder range held inside what its plant type allows, with the most
 * never below the least. Used as the steppers move and as the type flips,
 * since an autoflower's seed-to-harvest runs longer than a flowering time.
 */
export function clampBreederWeeks({ min, max }, auto) {
  const limits = auto ? BREEDER_WEEKS.auto : BREEDER_WEEKS.photo;
  const lo = Math.min(limits.max, Math.max(limits.min, Math.round(Number(min) || limits.defaultMin)));
  const hi = Math.min(limits.max, Math.max(lo, Math.round(Number(max) || lo)));
  return { min: lo, max: hi };
}

/**
 * Pure: plants that would read identically on one line (same name, started
 * the same day, in the same stage since the same day, same window) collapse
 * into one row with a count. A tent of six clones is one line, not six.
 * Rows keep the order the plants were in.
 */
export function clockRows(clocks) {
  const rows = new Map();
  for (const c of clocks ?? []) {
    const key = [
      (c.plant?.name ?? "").trim().toLowerCase(), c.start, c.current?.stage, c.current?.start,
      c.window?.start, c.window?.end, c.window?.pending, c.window?.minWeeks, c.window?.maxWeeks,
    ].join("|");
    if (rows.has(key)) rows.get(key).count += 1;
    else rows.set(key, { ...c, count: 1 });
  }
  return [...rows.values()];
}

/**
 * Pure: where each growing plant stood on one day of the journal: its age
 * then, the stage it was in and how many days into it, and whether that day
 * fell inside its harvest window. Plants not yet started that day are left
 * out. Identical plants collapse into one row with a count, as on the home card.
 *
 * A day after `todayKey` has an age and may sit in a window, both of which are
 * dates counted forward; it has no stage, because nobody has moved anything
 * there yet.
 */
export function plantsOnDate(plants, records, dateKey, { crop, fallback = null, todayKey = null } = {}) {
  const ahead = Boolean(todayKey) && dateKey > todayKey;
  const rows = new Map();
  for (const plant of plants ?? []) {
    if ((plant?.status ?? "growing") !== "growing") continue;
    const start = plantStartDate(plant, fallback);
    if (!start || dateKey < start) continue;
    const spans = plantStageSpans(plant, records, fallback);
    const span = ahead ? null : spanOn(spans, dateKey);
    const window = harvestWindow(plant, spans, crop, start);
    const inWindow = Boolean(window && !window.pending && window.start <= dateKey && dateKey <= window.end
      && !(window.harvestedOn && window.harvestedOn < dateKey));
    const row = {
      plant,
      age: daysBetweenKeys(start, dateKey),
      stage: span?.stage ?? null,
      dayInStage: span ? daysBetweenKeys(span.start, dateKey) : null,
      inWindow,
      dayOfWindow: inWindow ? daysBetweenKeys(window.start, dateKey) + 1 : null,
      windowDays: inWindow ? daysBetweenKeys(window.start, window.end) + 1 : null,
    };
    const key = [(plant.name ?? "").trim().toLowerCase(), row.age, row.stage, row.dayInStage, row.inWindow, row.dayOfWindow].join("|");
    if (rows.has(key)) rows.get(key).count += 1;
    else rows.set(key, { ...row, count: 1 });
  }
  return [...rows.values()];
}
