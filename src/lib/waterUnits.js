// Watering in whatever unit is in your hand: gallons for a big pot, litres for
// a jug, millilitres for a seedling.
//
// One rule makes mixed units work: gallons are the CANONICAL unit and the only
// thing ever summed. Every row also carries the number you actually typed and
// the unit you typed it in, so it comes back exactly as entered rather than as
// a converted decimal. Storing gallons is what lets 500 mL and 2 gal add up to
// a day total at all, and it means nothing already recorded needed migrating.
//
// Pure - no React, no storage beyond the remembered default - so it is tested
// directly.

const L_PER_GAL = 3.785411784;

export const WATER_UNITS = [
  { value: "gal", label: "gal", perGallon: 1 },
  { value: "l",   label: "L",   perGallon: L_PER_GAL },
  { value: "ml",  label: "mL",  perGallon: L_PER_GAL * 1000 },
];

export const DEFAULT_WATER_UNIT = "gal";

// How many decimals are worth showing. A millilitre reading is never fractional.
const DECIMALS = { gal: 2, l: 2, ml: 0 };
// Sensible step for the number input, so the phone's stepper is not useless.
export const UNIT_STEP = { gal: 0.25, l: 0.5, ml: 50 };

export function isWaterUnit(unit) {
  return WATER_UNITS.some((u) => u.value === unit);
}

export function waterUnit(unit) {
  return WATER_UNITS.find((u) => u.value === unit) ?? WATER_UNITS[0];
}

export function unitLabel(unit) {
  return waterUnit(unit).label;
}

/** Canonical gallons from an amount the grower typed. NaN/blank -> null. */
export function toGallons(amount, unit) {
  const n = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  return n / waterUnit(unit).perGallon;
}

/** Canonical gallons back out into a unit, rounded to what is worth showing. */
export function fromGallons(gal, unit) {
  const n = typeof gal === "number" ? gal : parseFloat(gal);
  if (!Number.isFinite(n)) return null;
  const converted = n * waterUnit(unit).perGallon;
  const dp = DECIMALS[unit] ?? 2;
  return Math.round(converted * 10 ** dp) / 10 ** dp;
}

/** "2.5 gal" / "9.46 L" / "500 mL". Blank input gives "". */
export function formatWater(gal, unit) {
  const n = fromGallons(gal, unit);
  if (n == null) return "";
  return `${n} ${unitLabel(unit)}`;
}

/**
 * The number and unit to SHOW for one stored row.
 *
 * A row written since units existed carries its own; an older one is gallons,
 * because that is all there was. Either way what comes back is what was typed,
 * never a conversion of a conversion.
 */
export function rowDisplay(row) {
  const unit = isWaterUnit(row?.unit) ? row.unit : DEFAULT_WATER_UNIT;
  const typed = row?.amount;
  const n = typeof typed === "number" ? typed : parseFloat(typed);
  if (Number.isFinite(n)) return { amount: n, unit };
  // Legacy row: only gallons were ever stored.
  const gal = parseFloat(row?.gal);
  if (!Number.isFinite(gal)) return { amount: null, unit };
  return { amount: fromGallons(gal, unit), unit };
}

/** Build a stored water row from what the grower typed. */
export function waterRow(base, amount, unit) {
  const gal = toGallons(amount, unit);
  return {
    ...base,
    amount: amount === "" || amount == null ? "" : amount,
    unit,
    // Kept so totals, stats, the report and every older reader keep working.
    gal: gal == null ? "" : Math.round(gal * 10000) / 10000,
  };
}

// Coarsest first. A set of rows reads out in the coarsest unit anyone actually
// used, so litres and millilitres together come back as litres and a day logged
// in litres is never read back as gallons.
const UNIT_RANK = { gal: 3, l: 2, ml: 1 };

/**
 * The unit to READ a set of rows out in - a day's total, a stat tile, a chip.
 *
 * It comes from the rows themselves, never from whatever unit happens to be in
 * hand today: what was logged in litres stays litres. Rows written before units
 * existed only ever held gallons. With nothing recognisable to go on, the
 * fallback (usually the remembered unit) decides; pass null for the fallback to
 * get null back, for a caller that wants to say "the rows did not know".
 */
export function displayUnit(rows, fallback = DEFAULT_WATER_UNIT) {
  let best = null;
  for (const row of rows ?? []) {
    if (!row) continue;
    const unit = isWaterUnit(row.unit)
      ? row.unit
      : (Number.isFinite(parseFloat(row.gal)) ? DEFAULT_WATER_UNIT : null);
    if (!unit) continue;
    if (best == null || UNIT_RANK[unit] > UNIT_RANK[best]) best = unit;
  }
  return best ?? (isWaterUnit(fallback) ? fallback : null);
}

/**
 * One water row per plant, each recording the SAME amount.
 *
 * "I watered them all with 3 L" is one sentence but several waterings: three
 * litres went into each pot, and the record has to say so plant by plant.
 */
export function fanOutWater(plants, amount, unit) {
  return (plants ?? [])
    .filter(Boolean)
    .map((p) => waterRow(
      { plant: p.name ?? "", ...(p.id ? { plantId: p.id } : {}) },
      amount,
      unit,
    ));
}

/**
 * A day's watering described the way it should be read back: what each plant
 * got, in the unit that plant's row was logged in, and only then the total in
 * the unit the day was logged in.
 *
 * This is what MJ is handed, so that "how much did I water on Tuesday" is
 * answered plant by plant in the grower's own measure, rather than as one
 * canonical gallon figure nobody typed.
 */
export function describeWater(gal, rows) {
  const list = (rows ?? []).filter(Boolean);
  const out = {};
  if (list.length) {
    out.per_plant = list.map((w) => {
      const { amount, unit } = rowDisplay(w);
      return { plant: String(w.plant ?? "").trim() || "all plants", amount, unit: unitLabel(unit) };
    });
  }
  const total = typeof gal === "number" ? gal : parseFloat(gal);
  if (Number.isFinite(total)) out.total = formatWater(total, displayUnit(list));
  return Object.keys(out).length ? out : null;
}

/**
 * Fold a fresh set of per-plant rows into what the day already holds.
 *
 * A plant named in the new set has its row REPLACED, so saying "they all got
 * 3 L" twice records it once. Every other row on the day - another plant, an
 * unattributed whole-grow watering - is left exactly as it was.
 */
export function mergeWaterRows(existing, added) {
  const ids = new Set();
  const names = new Set();
  for (const r of added ?? []) {
    if (r?.plantId) ids.add(String(r.plantId));
    const name = String(r?.plant ?? "").trim().toLowerCase();
    if (name) names.add(name);
  }
  const replaced = (r) =>
    (r?.plantId && ids.has(String(r.plantId)))
    || names.has(String(r?.plant ?? "").trim().toLowerCase());
  return [...(existing ?? []).filter((r) => r && !replaced(r)), ...(added ?? [])];
}

/** Total of a day's water rows, in canonical gallons. */
export function sumGallons(rows) {
  return (rows ?? []).reduce((sum, r) => {
    const gal = parseFloat(r?.gal);
    return Number.isFinite(gal) ? sum + gal : sum;
  }, 0);
}

// ── The unit to offer next time ──────────────────────────────────────────────
// Whatever you last watered in is what the next row starts as, and what totals
// are shown in. Mirrors how the choice fields remember a custom value.
const STORAGE_KEY = "waterUnit";

export function loadWaterUnit() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isWaterUnit(saved) ? saved : DEFAULT_WATER_UNIT;
  } catch {
    return DEFAULT_WATER_UNIT;
  }
}

export function rememberWaterUnit(unit) {
  if (!isWaterUnit(unit)) return;
  try { localStorage.setItem(STORAGE_KEY, unit); } catch { /* storage unavailable */ }
}
