// Turning what you wrote into what was logged.
//
// You write "gave them all about 3 litres and a bit of cal-mag, trichs mostly
// cloudy with maybe 10% amber" and the day's record fills itself in. A model
// does the reading; this module decides what is allowed to come back from it
// and what it becomes.
//
// Two rules run through the whole thing.
//
// A reading is a claim about what you wrote, not a measurement, so nothing is
// invented to fill a gap: a field the model did not report is left absent
// rather than defaulted, and an absent field never overwrites something you
// typed yourself. And every value that does land is remembered as having been
// read, so the record can say so - which is the only reason writing it in
// without asking is honest at all.
//
// Pure - no network, no React - so it is tested directly.

import { fanOutWater, isWaterUnit, sumGallons, toGallons, waterRow } from "./waterUnits.js";
import { words } from "./crops.js";

// Ranges a real reading falls in. A model that hands back 850°F has misread a
// sentence, and a wrong number in the record is worse than a missing one.
const LIMITS = {
  temp: { min: -40, max: 160 },
  humidity: { min: 0, max: 100 },
  amount: { min: 0, max: 100000 },
};
const MAX_FEED = 500;
const MAX_TEXT = 300;
const MAX_ROWS = 40;

// One watering is two columns - the per-plant rows and the day's canonical
// total - so both answer to a single "water" provenance key. Everything else
// is its own key.
const READ_KEY = { water_gal: "water", water_plants: "water" };
function readKey(field) {
  return READ_KEY[field] ?? field;
}

function clampNum(v, { min, max }) {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return n < min || n > max ? null : n;
}

function text(v, max = MAX_TEXT) {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

/**
 * Match a name the model reported against the space's actual roster.
 *
 * Case and surrounding punctuation are the model's to get wrong, not yours, so
 * matching is loose. A name that matches nothing is kept as written but carries
 * no plant id: it goes in the record as text and is attached to nothing, which
 * is better than silently attributing a watering to the wrong plant.
 */
export function matchPlant(name, plants) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return null;
  for (const p of plants ?? []) {
    const known = String(p?.name ?? "").trim().toLowerCase();
    if (known && known === wanted) return p;
  }
  return null;
}

// The waterings a reading describes, as stored rows.
function waterRowsFrom(water, plants, activePlants) {
  const amount = clampNum(water?.amount, LIMITS.amount);
  if (amount == null || amount <= 0) return null;
  const unit = isWaterUnit(water?.unit) ? water.unit : "gal";

  // Named plants win: "Blue Dream got 2 L" is about Blue Dream, whatever else
  // the sentence said.
  const named = Array.isArray(water?.plants)
    ? water.plants.map((n) => ({ raw: text(n, 60), match: matchPlant(n, plants) })).filter((x) => x.raw)
    : [];
  if (named.length > 0) {
    return named.slice(0, MAX_ROWS).map(({ raw, match }) => waterRow(
      { plant: match?.name ?? raw, ...(match?.id ? { plantId: match.id } : {}) },
      amount,
      unit,
    ));
  }

  // "They all got 3 L" is one sentence but several waterings, one per plant.
  if (water?.per_plant === true && activePlants.length > 0) {
    return fanOutWater(activePlants, amount, unit);
  }

  // Everything else is a whole-space watering: a real thing to record, and the
  // honest shape for it is one row that names nobody.
  return [waterRow({ plant: "" }, amount, unit)];
}

function rowsFrom(list, plants, build) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list.slice(0, MAX_ROWS)) {
    const row = build(item, matchPlant(item?.plant, plants));
    if (row) out.push(row);
  }
  return out.length > 0 ? out : null;
}

/**
 * A model's reading of one day's writing, turned into a patch for that day's
 * log plus the list of fields it accounts for.
 *
 * Only fields the reading actually reported come back. The caller merges the
 * patch over the day's existing row, so anything the reading is silent about
 * keeps whatever was already there.
 */
export function readingToLogPatch(reading, { plants = [], crop } = {}) {
  const w = words(crop);
  const roster = (plants ?? []).filter(Boolean);
  const active = roster.filter((p) => (p?.status ?? "growing") === "growing");

  const patch = {};
  const read = {};

  const waterRows = waterRowsFrom(reading?.water, roster, active);
  if (waterRows) {
    patch.water_plants = waterRows;
    patch.water_gal = Math.round(sumGallons(waterRows) * 10000) / 10000;
    read.water = true;
  }

  const feed = text(reading?.feed, MAX_FEED);
  if (feed) { patch.feed = feed; read.feed = true; }

  for (const [field, key] of [["temp_high", "temp_high"], ["temp_low", "temp_low"]]) {
    const n = clampNum(reading?.[field], LIMITS.temp);
    if (n != null) { patch[key] = n; read[key] = true; }
  }
  const humidity = clampNum(reading?.humidity, LIMITS.humidity);
  if (humidity != null) { patch.humidity = humidity; read.humidity = true; }

  const training = rowsFrom(reading?.training, roster, (item, match) => {
    const action = text(item?.action);
    if (!action) return null;
    return { plant: match?.name ?? text(item?.plant, 60) ?? "", ...(match?.id ? { plantId: match.id } : {}), action };
  });
  if (training) { patch.training = training; read.training = true; }

  const health = rowsFrom(reading?.health, roster, (item, match) => {
    const color = text(item?.color, 80);
    const trichomes = text(item?.trichomes, 80);
    const notes = text(item?.notes);
    if (!color && !trichomes && !notes) return null;
    return {
      plant: match?.name ?? text(item?.plant, 60) ?? w.Unit,
      ...(match?.id ? { plantId: match.id } : {}),
      ...(color ? { color } : {}),
      ...(trichomes ? { trichomes } : {}),
      ...(notes ? { notes } : {}),
    };
  });
  if (health) { patch.plant_health = health; read.plant_health = true; }

  return { patch, read, found: Object.keys(read).length > 0 };
}

/**
 * Merge a reading's patch over the row a day already has.
 *
 * What you typed yourself outranks what was read from your prose, always: a
 * field already carrying a value you entered is left alone unless the previous
 * value was itself read. That is what stops a re-read of an edited entry from
 * quietly undoing a correction you made by hand.
 */
export function mergeReading(existing, patch, previouslyRead) {
  const out = { ...(existing ?? {}) };
  const wasRead = previouslyRead ?? {};
  for (const [field, value] of Object.entries(patch ?? {})) {
    const current = out[field];
    const empty = current == null || current === "" || (Array.isArray(current) && current.length === 0);
    if (empty || wasRead[readKey(field)] === true) out[field] = value;
  }
  return out;
}

/** Canonical gallons for a typed amount, for callers that only have the pair. */
export function gallonsOf(amount, unit) {
  return toGallons(amount, isWaterUnit(unit) ? unit : "gal");
}
