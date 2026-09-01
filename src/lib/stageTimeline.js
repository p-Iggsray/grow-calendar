// The grow's timeline, derived from what actually happened.
//
// There are no predicted dates anymore. Every time a grower moves a plant to
// its next stage, that switch is recorded with the day it happened, and the
// calendar, the day counter and every phase label are read back out of those
// records. The timeline is a history, not a forecast.

// Ordered plant stages (mirrors PLANT_STAGES in worker/plantsRoster.js).
export const STAGE_ORDER = [
  "germination", "seedling", "vegetative", "flowering", "flushing",
  "harvest", "drying", "curing", "done",
];

export const STAGE_LABEL = {
  germination: "Germination",
  seedling: "Seedling",
  vegetative: "Vegetative",
  flowering: "Flowering",
  flushing: "Flushing",
  harvest: "Harvest",
  drying: "Drying",
  curing: "Curing",
  done: "Done",
};

// One colour per group of stages, so the calendar reads as a few clear
// seasons rather than a nine-colour quilt. Values match the old phase
// families, so the app's palette is unchanged.
const STAGE_GROUP = {
  germination: { key: "setup",   label: "Setup",   color: "#5b8dee" },
  seedling:    { key: "setup",   label: "Setup",   color: "#5b8dee" },
  vegetative:  { key: "veg",     label: "Veg",     color: "#22c55e" },
  flowering:   { key: "flower",  label: "Flower",  color: "#f97316" },
  flushing:    { key: "flush",   label: "Flush",   color: "#0ea5e9" },
  harvest:     { key: "harvest", label: "Harvest", color: "#d97706" },
  drying:      { key: "harvest", label: "Harvest", color: "#d97706" },
  curing:      { key: "harvest", label: "Harvest", color: "#d97706" },
  done:        { key: "harvest", label: "Harvest", color: "#d97706" },
};

export function stageGroup(stage) {
  return STAGE_GROUP[stage] ?? null;
}
export function stageLabel(stage) {
  return STAGE_LABEL[stage] ?? null;
}
export function stageIndex(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? -1 : i;
}

// Pure: the environment's stage on a given day.
//
// Stages only ever move forward, so the grow's stage on a date is the furthest
// any of its plants had reached by then: flip your first plant to flowering
// and the grow is in flower from that day. `events` must be sorted ascending
// by date and carry a running `stage`.
export function stageOnDate(events, dateKey) {
  if (!Array.isArray(events) || !dateKey) return null;
  let current = null;
  for (const e of events) {
    if (!e?.date || e.date > dateKey) break;
    current = e.stage;
  }
  return current;
}

// Pure: collapse raw stage records into a forward-only running timeline.
// Each entry is {date, stage}; several plants switching on the same day
// collapse into the furthest stage reached that day.
//
// `startDate` is the space's day 0. A record older than that is one of the
// backdated seeds the wizard used to write, so it is pulled forward to day 0
// rather than dropped: the space still starts in the stage it was set up in,
// it just stops claiming to have been running before it existed.
export function buildRunningTimeline(records, startDate = null) {
  const sorted = [...(records ?? [])]
    .filter((r) => r?.date && stageIndex(r.stage) >= 0)
    .map((r) => (startDate && r.date < startDate ? { ...r, date: startDate } : r))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const out = [];
  let best = -1;
  for (const r of sorted) {
    const idx = stageIndex(r.stage);
    if (idx <= best) continue;           // already at or past this stage
    best = idx;
    const stage = STAGE_ORDER[idx];
    // Two plants advancing on one day yield a single entry for that day.
    if (out.length && out[out.length - 1].date === r.date) out[out.length - 1].stage = stage;
    else out.push({ date: r.date, stage });
  }
  return out;
}

// Pure: a space's day 0. It is the day the space was created, and nothing else.
//
// It used to take the earlier of that and the oldest stage record, to keep the
// history of grows set up while the wizard still asked "when did this stage
// start". That backdated seed then aged the space by however far back the
// answer went - a space made yesterday reporting day 31 - which is exactly the
// assumption this app is supposed to have stopped making.
export function growAnchor(createdAt) {
  return typeof createdAt === "string" && createdAt ? createdAt.slice(0, 10) : null;
}

// Pure: how many days a date is into a grow (or into one plant's life),
// counting from the day it was created in the app. The day something is created
// is day 0, the next day is day 1. Returns null before the anchor day, or when
// there is no anchor yet.
//
// Zero is a real answer here, so callers must test `!= null`, never truthiness.
export function dayOfGrow(anchorDate, dateKey) {
  if (!anchorDate || !dateKey || dateKey < anchorDate) return null;
  const [y1, m1, d1] = anchorDate.split("-").map(Number);
  const [y2, m2, d2] = dateKey.split("-").map(Number);
  if (!y1 || !y2) return null;
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

// Pure: the furthest stage the plants are in right now. Used for labels when
// a plant has a stage but no recorded switch yet (older grows).
export function currentStageOf(plants) {
  let best = -1;
  for (const p of plants ?? []) {
    if ((p?.status ?? "growing") !== "growing") continue;
    const i = stageIndex(p?.stage);
    if (i > best) best = i;
  }
  return best < 0 ? null : STAGE_ORDER[best];
}
