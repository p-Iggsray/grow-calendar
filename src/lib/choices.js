// Preset choices for the fields a grower fills in over and over.
//
// Typing the same thing every session is slow and makes the data messy
// ("LST", "lst", "low stress training" are three values to a computer). These
// lists turn most inputs into taps. Anything genuinely unusual can still be
// typed, and what you type is remembered and offered next time.

export const NUTRIENT_PRODUCTS = [
  "Plain water",
  "Fox Farm Trio",
  "General Hydroponics Flora Series",
  "Advanced Nutrients",
  "Jack's 321",
  "Mega Crop",
  "Canna Coco A+B",
  "Botanicare",
  "Roots Organics",
  "Gaia Green",
  "Dr. Earth",
  "Cal-Mag supplement",
  "Silica",
  "Molasses",
  "Compost tea",
  "Top dressing",
];

export const NUTRIENT_DOSES = [
  "Quarter strength",
  "Half strength",
  "Three-quarter strength",
  "Full strength",
];

export const TRAINING_ACTIONS = [
  "LST (tied down)",
  "Topped",
  "FIM",
  "Defoliated",
  "Supercropped",
  "Lollipopped",
  "SCROG / trellis",
  "Staked",
  "Pruned lower growth",
  "Bent branches",
];

export const LEAF_COLORS = [
  "Healthy green",
  "Deep green",
  "Light green",
  "Yellowing lower leaves",
  "Yellowing overall",
  "Purple stems",
  "Brown spots",
  "Burnt tips",
  "Curling / clawing",
  "Wilting",
];

export const TRICHOME_STATES = [
  "Clear",
  "Mostly clear",
  "Cloudy",
  "Mostly cloudy",
  "Cloudy with some amber",
  "Mostly amber",
];

export const LIGHT_SCHEDULES = ["18/6", "20/4", "24/0", "16/8", "12/12", "Sunlight"];

export const LIGHT_TYPES = [
  "LED quantum board",
  "LED bar",
  "HPS",
  "MH",
  "CMH / LEC",
  "T5 fluorescent",
  "CFL",
  "Sunlight",
];

export const LIGHT_WATTS = ["100", "150", "200", "240", "320", "480", "600", "1000"];

export const SPACE_SIZES = [
  "2x2 tent",
  "2x4 tent",
  "3x3 tent",
  "4x4 tent",
  "4x8 tent",
  "5x5 tent",
  "Closet",
  "Spare room",
  "Basement",
  "Greenhouse",
  "Raised bed",
  "Open ground",
];

export const SPACE_NAMES = [
  "Flower Tent",
  "Veg Tent",
  "Main Tent",
  "4x4 Tent",
  "Backyard",
  "Greenhouse",
  "Basement",
  "Closet",
];

// ── Remembering what the grower typed ────────────────────────────────────────
// Custom entries are kept per field on this device, newest first, so a grower's
// own nutrient line or training move becomes a one-tap choice from then on.

const STORE_PREFIX = "choices:";
const MAX_REMEMBERED = 20;

export function loadRemembered(fieldKey) {
  if (!fieldKey) return [];
  try {
    const raw = localStorage.getItem(STORE_PREFIX + fieldKey);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberValue(fieldKey, value) {
  const text = String(value ?? "").trim();
  if (!fieldKey || !text) return;
  try {
    const next = [text, ...loadRemembered(fieldKey).filter((v) => !sameChoice(v, text))]
      .slice(0, MAX_REMEMBERED);
    localStorage.setItem(STORE_PREFIX + fieldKey, JSON.stringify(next));
  } catch { /* storage unavailable: the picker still works, just forgets */ }
}

export function forgetValue(fieldKey, value) {
  if (!fieldKey) return;
  try {
    const next = loadRemembered(fieldKey).filter((v) => !sameChoice(v, value));
    localStorage.setItem(STORE_PREFIX + fieldKey, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

// Pure: two choices match when they differ only by case or padding.
export function sameChoice(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

// Pure: the full option list for a field - presets, then anything the grower
// has typed before, plus the current value if it is not already in there.
// Never returns duplicates.
export function buildOptions(presets = [], remembered = [], current = "") {
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const text = String(v ?? "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  for (const p of presets) push(p);
  for (const r of remembered) push(r);
  push(current);
  return out;
}

// Pure: case-insensitive contains, for the picker's search box.
export function filterOptions(options, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => String(o).toLowerCase().includes(q));
}
