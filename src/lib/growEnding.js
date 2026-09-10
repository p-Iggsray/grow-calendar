// How a grow ended, and why.
//
// A space outlives what grows in it. An outdoor bed, a tent, a monotub: the
// plants finish or they are lost, and the space is still there for the next
// lot. So an ending is recorded against the space without closing it. The
// space's own `status` is not touched, which is the whole point: marking a
// space harvested or abandoned takes it out of the active view and out of the
// calendar, and that is the wrong thing to do to a bed you will plant again in
// April.
//
// Endings accumulate. They are never edited in place and never quietly
// replaced, because the record of a run that went wrong is exactly the thing
// worth keeping. Starting again in the same space just means adding plants; the
// old endings stay as history underneath.
//
// Nothing here knows about React or the DOM, so the worker validates against
// the same lists the UI offers.

import { cropOf } from "./crops.js";

/**
 * The two ways a run stops.
 *
 * They are genuinely different and worth separating: one is the plan working,
 * the other is the plan being taken away from you. A grow that ran its course
 * needs no explanation; a grow that ended short is the one you will want to
 * read back later and learn from, so it asks for a reason.
 */
export const END_OUTCOMES = [
  { value: "finished", label: "Finished", blurb: "It ran its course and came off as planned" },
  { value: "lost", label: "Ended short", blurb: "Something ended it before it was done" },
];
export const OUTCOME_VALUES = new Set(END_OUTCOMES.map((o) => o.value));

// What can take a grow before its time. Ordered roughly by how often it is the
// answer, not alphabetically, because this is a list somebody scrolls once
// while upset and the common causes should not be hunted for.
const COMMON_REASONS = [
  { value: "theft", label: "Stolen" },
  { value: "pests", label: "Pests" },
  { value: "disease", label: "Disease" },
  { value: "weather", label: "Weather" },
  { value: "heat", label: "Heat" },
  { value: "cold", label: "Cold or frost" },
  { value: "animals", label: "Animals" },
  { value: "equipment", label: "Equipment failure" },
  { value: "neglect", label: "Watering or feeding" },
];

// The failure each crop has that the other does not. A monotub is lost to
// contamination more than anything else, and no cannabis plant ever was; a
// cannabis plant can throw male flowers and seed the whole tent, and no tub
// ever did.
const CROP_REASONS = {
  cannabis: [
    { value: "mold", label: "Mold or bud rot" },
    { value: "hermie", label: "Went hermie or seeded" },
  ],
  mushrooms: [
    { value: "contamination", label: "Contamination" },
    { value: "dried_out", label: "Dried out" },
  ],
};

const OTHER_REASON = { value: "other", label: "Something else" };

/** The reasons offered for this crop, crop-specific ones first. */
export function endReasons(crop) {
  return [...(CROP_REASONS[cropOf(crop)] ?? []), ...COMMON_REASONS, OTHER_REASON];
}

export function isEndReason(value, crop) {
  return endReasons(crop).some((r) => r.value === value);
}

export function reasonLabel(value, crop) {
  return endReasons(crop).find((r) => r.value === value)?.label ?? null;
}

/**
 * What each plant became.
 *
 * `dead` already existed in the roster's allowed statuses and had no way to be
 * set from anywhere in the app, which is why a plant that died had to be filed
 * as harvested. This is where it finally gets used.
 */
export const PLANT_FATES = [
  { value: "harvested", label: "Harvested" },
  { value: "dead", label: "Lost" },
];
export const FATE_VALUES = new Set(PLANT_FATES.map((f) => f.value));

/** What the fate picker starts on, given the outcome. Per plant, still editable. */
export function defaultFate(outcome) {
  return outcome === "finished" ? "harvested" : "dead";
}

/**
 * Pure: the endings list, oldest first, tolerating whatever is in the column.
 *
 * A grow written before this existed has no column, a null, or something a
 * hand-edited restore left behind. None of those is a reason for the screen to
 * fail to render.
 */
export function endingList(endings) {
  return Array.isArray(endings) ? endings.filter((e) => e && typeof e === "object") : [];
}

export function latestEnding(endings) {
  const list = endingList(endings);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Pure: is the space between runs?
 *
 * Both halves are needed. An ending on its own is history, and the moment a
 * plant is growing again the space is running whatever happened last autumn.
 * Nothing growing and no ending is a space that was never planted, which reads
 * as empty rather than as ended.
 */
export function isRunEnded(endings, plants) {
  if (!latestEnding(endings)) return false;
  return !(plants ?? []).some((p) => p?.status === "growing");
}

/**
 * Pure: how many of each fate one ending recorded, for a one line summary.
 */
export function fateCounts(ending) {
  const out = { harvested: 0, dead: 0 };
  for (const p of ending?.plants ?? []) {
    if (p?.status === "harvested") out.harvested++;
    else if (p?.status === "dead") out.dead++;
  }
  return out;
}

/**
 * Pure: the sentence that goes under the heading, without the date.
 *
 * The caller formats the date, because the report and the app format dates
 * differently and neither should be forced into the other's style.
 */
export function endingHeadline(ending, crop) {
  if (!ending) return "";
  const w = wordsFor(crop);
  const { harvested, dead } = fateCounts(ending);
  const total = harvested + dead;
  if (!total) return ending.outcome === "finished" ? "Finished" : "Ended short";

  const unit = total === 1 ? w.unit : w.units;
  if (dead && harvested) return `${harvested} of ${total} ${unit} harvested, ${dead} lost`;
  if (dead) return `${dead} ${unit} lost`;
  return `${harvested} ${unit} harvested`;
}

// Kept local rather than importing words() wholesale, so this module pulls in
// only what it uses.
function wordsFor(crop) {
  return cropOf(crop) === "mushrooms"
    ? { unit: "tub", units: "tubs" }
    : { unit: "plant", units: "plants" };
}
