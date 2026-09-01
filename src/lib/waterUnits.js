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
