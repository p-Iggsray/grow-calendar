// @ts-check
// What a space grows, and therefore what everything in it is called.
//
// Two crops share one app. A cannabis tent holds plants of a strain that move
// germination -> harvest; a monotub holds tubs of a species that move
// inoculation -> a dried flush. Underneath they are the same machinery: a
// roster of things with stages, a per-day log, a journal, and a calendar
// coloured by the stage each day was in. They differ in the stages themselves
// and in every word around them, and all of that lives here so a screen asks
// this file rather than deciding for itself.
//
// Two rules make this work without threading a crop parameter through the
// whole app:
//
//   1. Stage ids are unique ACROSS crops. "fruiting" can only be a mushroom
//      and "flowering" can only be cannabis, so an id says which crop it
//      belongs to and the timeline, the calendar and the stage history never
//      have to be told.
//   2. Every stage sits in ONE ordered list, cannabis first. A grow only ever
//      holds one crop's stages, so ordering within a crop is all that is ever
//      compared, and the forward-only timeline keeps working untouched.
//
// A space that never said what it grows is cannabis. That is what every space
// was before this file existed, and it is what they must keep reading as.

export const CROPS = ["cannabis", "mushrooms"];
export const DEFAULT_CROP = "cannabis";

export function isCrop(value) {
  return CROPS.includes(value);
}

/** The crop of a grow, from its survey or a bare crop string. */
export function cropOf(surveyOrCrop) {
  const value = typeof surveyOrCrop === "string" ? surveyOrCrop : surveyOrCrop?.crop;
  return isCrop(value) ? value : DEFAULT_CROP;
}

// ── Stages ───────────────────────────────────────────────────────────────────
// Ordered per crop. The grower advances a plant or a tub by hand; nothing here
// is predicted.
//
// The mushroom ladder ends at the tub's own finish line. A monotub fruits over
// and over, so picking is NOT a stage the tub leaves and returns to: it sits in
// Fruiting and each flush is recorded as its own harvest with a date and a
// weight (see FLUSH_FIELDS). The tub only moves on to Harvest when it is spent.
export const CROP_STAGES = {
  cannabis: [
    "germination", "seedling", "vegetative", "flowering", "flushing",
    "harvest", "drying", "curing", "done",
  ],
  mushrooms: [
    "inoculation", "colonization", "spawn_to_bulk", "consolidation",
    "fruiting", "flush_harvest", "dehydrating", "stored",
  ],
};

/** Every stage of every crop, in one order: the app's global stage ladder. */
export const ALL_STAGES = [...CROP_STAGES.cannabis, ...CROP_STAGES.mushrooms];

export const STAGE_LABEL = {
  // Cannabis
  germination:   "Germination",
  seedling:      "Seedling",
  vegetative:    "Vegetative",
  flowering:     "Flowering",
  flushing:      "Flushing",
  harvest:       "Harvest",
  drying:        "Drying",
  curing:        "Curing",
  done:          "Done",
  // Mushrooms
  inoculation:   "Inoculation",
  colonization:  "Colonization",
  spawn_to_bulk: "Spawn to bulk",
  consolidation: "Consolidation",
  fruiting:      "Fruiting",
  flush_harvest: "Harvest",
  dehydrating:   "Drying",
  stored:        "Done",
};

// One colour per group of stages, so the calendar reads as a few clear seasons
// rather than a seventeen-colour quilt. The cannabis values are the app's
// original palette, unchanged. Mushrooms borrow the same five colours: setup
// blue for inoculation, a violet band while the mycelium runs, the flower
// orange for fruiting (it is the same moment in the life of the thing), and
// harvest amber for everything after the first pick.
export const STAGE_GROUP = {
  germination:   { key: "setup",     label: "Setup",     color: "#5b8dee" },
  seedling:      { key: "setup",     label: "Setup",     color: "#5b8dee" },
  vegetative:    { key: "veg",       label: "Veg",       color: "#22c55e" },
  flowering:     { key: "flower",    label: "Flower",    color: "#f97316" },
  flushing:      { key: "flush",     label: "Flush",     color: "#0ea5e9" },
  harvest:       { key: "harvest",   label: "Harvest",   color: "#d97706" },
  drying:        { key: "harvest",   label: "Harvest",   color: "#d97706" },
  curing:        { key: "harvest",   label: "Harvest",   color: "#d97706" },
  done:          { key: "harvest",   label: "Harvest",   color: "#d97706" },

  inoculation:   { key: "setup",     label: "Setup",     color: "#5b8dee" },
  colonization:  { key: "colonize",  label: "Colonize",  color: "#a78bfa" },
  spawn_to_bulk: { key: "colonize",  label: "Colonize",  color: "#a78bfa" },
  consolidation: { key: "colonize",  label: "Colonize",  color: "#a78bfa" },
  fruiting:      { key: "fruit",     label: "Fruiting",  color: "#f97316" },
  flush_harvest: { key: "harvest",   label: "Harvest",   color: "#d97706" },
  dehydrating:   { key: "harvest",   label: "Harvest",   color: "#d97706" },
  stored:        { key: "harvest",   label: "Harvest",   color: "#d97706" },
};

/** The ordered stages of one crop. */
export function stagesFor(crop) {
  return CROP_STAGES[cropOf(crop)];
}

/** The crop a stage belongs to, or null if it is not a stage at all. */
export function cropOfStage(stage) {
  for (const crop of CROPS) {
    if (CROP_STAGES[crop].includes(stage)) return crop;
  }
  return null;
}

/** Where a new plant or tub starts when nothing says otherwise. */
export function defaultStage(crop) {
  return stagesFor(crop)[cropOf(crop) === "mushrooms" ? 0 : 1];
}

// What the wizard offers as "where are you right now": every stage up to and
// including the first harvest, since nothing past that is a place to start.
export function wizardStages(crop) {
  return WIZARD_STAGE_BLURBS[cropOf(crop)];
}

const WIZARD_STAGE_BLURBS = {
  cannabis: [
    { value: "germination", icon: "🌰", blurb: "Cracking seeds, taproot showing" },
    { value: "seedling",    icon: "🌱", blurb: "First leaves, gentle light" },
    { value: "vegetative",  icon: "🌿", blurb: "Leafy growth, building structure" },
    { value: "flowering",   icon: "🌸", blurb: "Buds forming" },
    { value: "flushing",    icon: "💧", blurb: "Plain water before harvest" },
    { value: "harvest",     icon: "✂️", blurb: "Ready to cut" },
  ],
  mushrooms: [
    { value: "inoculation",   icon: "💉", blurb: "Spore or liquid culture into grain" },
    { value: "colonization",  icon: "🧫", blurb: "Grain running white" },
    { value: "spawn_to_bulk", icon: "🪣", blurb: "Spawn mixed into the tub" },
    { value: "consolidation", icon: "🕸️", blurb: "Surface knitting over, before pins" },
    { value: "fruiting",      icon: "🍄", blurb: "Pins set, fruits growing" },
    { value: "flush_harvest", icon: "🧺", blurb: "Picking flushes" },
  ],
}
;

// ── Words ────────────────────────────────────────────────────────────────────
// Only the words the app actually says. Every screen reads them from here so a
// monotub never calls a tub a plant, and a tent never calls a strain a species.
const WORDS = {
  cannabis: {
    crop: "cannabis",
    cropLabel: "Cannabis",
    cropBlurb: "Plants, strains, veg and flower",
    // One thing in the roster.
    unit: "plant", units: "plants", Unit: "Plant", Units: "Plants",
    // What kind of thing it is.
    variety: "strain", varieties: "strains", Variety: "Strain", Varieties: "Strains",
    varietyPlaceholder: "e.g. Blue Dream",
    varietyPlaceholderAlt: "e.g. OG Kush",
    // Roster screens.
    rosterEmpty: "No plants yet",
    addUnit: "Add plant",
    // The day's log.
    waterSection: "Watering & Nutrients",
    waterField: "Water",
    waterNoun: "watering",
    waterVerb: "watered",
    waterAllTitle: "Water every plant",
    healthSection: "Plant Health",
    // Setup.
    lengthLabel: "Expected flower time",
    lengthUnit: "weeks",
    lengthMin: 6, lengthMax: 16, lengthDefault: 9,
    countLabel: "How many plants of this strain?",
    // The finish.
    yieldLabel: "Harvest weight",
  },
  mushrooms: {
    crop: "mushrooms",
    cropLabel: "Mushrooms",
    cropBlurb: "Monotubs, species, colonize and fruit",
    unit: "tub", units: "tubs", Unit: "Tub", Units: "Tubs",
    variety: "species", varieties: "species", Variety: "Species", Varieties: "Species",
    varietyPlaceholder: "e.g. Golden Teacher",
    varietyPlaceholderAlt: "e.g. Blue Oyster",
    rosterEmpty: "No tubs yet",
    addUnit: "Add tub",
    waterSection: "Misting & Hydration",
    waterField: "Misted",
    waterNoun: "misting",
    waterVerb: "misted",
    waterAllTitle: "Mist every tub",
    healthSection: "Tub Health",
    lengthLabel: "Expected time to first flush",
    lengthUnit: "weeks",
    lengthMin: 1, lengthMax: 12, lengthDefault: 4,
    countLabel: "How many tubs of this species?",
    yieldLabel: "Flush weight",
  },
};

/** The words this crop uses. Never index WORDS directly. */
export function words(crop) {
  return WORDS[cropOf(crop)];
}

// ── Varieties ────────────────────────────────────────────────────────────────
// The `type` on a roster entry: what kind of strain, or what kind of mushroom.
export const VARIETY_TYPES = {
  cannabis: [
    { value: "indica", label: "Indica" },
    { value: "sativa", label: "Sativa" },
    { value: "hybrid", label: "Hybrid" },
  ],
  mushrooms: [
    { value: "cube",      label: "Cubensis" },
    { value: "gourmet",   label: "Gourmet" },
    { value: "medicinal", label: "Medicinal" },
  ],
};

export function varietyTypes(crop) {
  return VARIETY_TYPES[cropOf(crop)];
}

export function defaultVarietyType(crop) {
  return varietyTypes(crop)[cropOf(crop) === "mushrooms" ? 0 : 2].value;
}

export function isVarietyType(crop, value) {
  return varietyTypes(crop).some((t) => t.value === value);
}

// Species worth offering by name. Cannabis strains come from the shared
// catalog other growers have logged; mushrooms have no such catalog yet, so
// these are the common monotub species typed straight in.
export const MUSHROOM_SPECIES = [
  { name: "Golden Teacher", type: "cube" },
  { name: "B+", type: "cube" },
  { name: "Penis Envy", type: "cube" },
  { name: "Albino A+", type: "cube" },
  { name: "Blue Meanie", type: "cube" },
  { name: "Mazatapec", type: "cube" },
  { name: "Blue Oyster", type: "gourmet" },
  { name: "Pink Oyster", type: "gourmet" },
  { name: "King Oyster", type: "gourmet" },
  { name: "Shiitake", type: "gourmet" },
  { name: "Lion's Mane", type: "medicinal" },
  { name: "Reishi", type: "medicinal" },
  { name: "Turkey Tail", type: "medicinal" },
];

// ── Flushes ──────────────────────────────────────────────────────────────────
// A monotub fruits again and again, and each flush is its own harvest: a date,
// which flush it is, and what came off wet and dry. Recorded as a log entry
// against the tub rather than as a stage, so the tub stays in Fruiting and the
// forward-only timeline is left alone.
export const FLUSH_FIELDS = ["flush", "wetG", "dryG"];

/** The number the next flush on a tub should be, from its history. */
export function nextFlushNumber(entries) {
  let best = 0;
  for (const e of entries ?? []) {
    if (e?.kind !== "flush") continue;
    const n = Number(e?.detail?.flush);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best + 1;
}

/** Total wet and dry grams a set of entries recorded, ignoring blanks. */
export function flushTotals(entries) {
  let wetG = 0, dryG = 0, flushes = 0;
  for (const e of entries ?? []) {
    if (e?.kind !== "flush") continue;
    flushes++;
    const wet = Number(e?.detail?.wetG);
    const dry = Number(e?.detail?.dryG);
    if (Number.isFinite(wet)) wetG += wet;
    if (Number.isFinite(dry)) dryG += dry;
  }
  return { flushes, wetG: Math.round(wetG * 10) / 10, dryG: Math.round(dryG * 10) / 10 };
}
