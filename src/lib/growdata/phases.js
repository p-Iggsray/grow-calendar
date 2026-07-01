// Single-character glyph per phase so the calendar is readable without color
// (WCAG 1.4.1). Same-color/different-strain phases share a glyph and rely on
// the surrounding date + aria-label to disambiguate.
export function phaseGlyph(phase) {
  if (!phase) return "";
  if (phase === "pre") return "";
  if (phase === "germination") return "G";
  if (phase === "seedling") return "S";
  if (phase === "transplant") return "T";
  if (phase.startsWith("veg") || phase === "early_veg") return "V";
  if (phase.startsWith("flush")) return "~";
  if (phase.startsWith("harvest")) return "H";
  if (phase.startsWith("flower") || phase === "pre_flower") return "F";
  return "";
}

// Phase families group the 13 granular phases into a handful of friendly stages
// with ONE color each. Used to (a) declutter the calendar (one color per family
// instead of 13 distinct phase colors) and (b) drive manual task entry, where a
// task spans a chosen number of consecutive families. Order matters: it's the
// sequence shown in the manual-task phase picker.
export const FAMILIES = {
  setup:   { key: "setup",   label: "Setup",   color: "#5b8dee", phases: ["germination", "seedling", "pre", "transplant"] },
  veg:     { key: "veg",     label: "Veg",     color: "#22c55e", phases: ["early_veg", "veg_cm", "veg_half", "veg_full"] },
  flower:  { key: "flower",  label: "Flower",  color: "#f97316", phases: ["pre_flower", "flower", "flower_haze"] },
  flush:   { key: "flush",   label: "Flush",   color: "#0ea5e9", phases: ["flush", "flush_gdp", "flush_haze"] },
  harvest: { key: "harvest", label: "Harvest", color: "#d97706", phases: ["harvest_gdp", "harvest_haze"] },
};

export const FAMILY_ORDER = ["setup", "veg", "flower", "flush", "harvest"];

// Reverse lookup: granular phase key -> family object.
const _PHASE_TO_FAMILY = (() => {
  const m = {};
  for (const key of FAMILY_ORDER) for (const p of FAMILIES[key].phases) m[p] = FAMILIES[key];
  return m;
})();

export function phaseFamily(phase) {
  return _PHASE_TO_FAMILY[phase] ?? null;
}

// Union of granular phase keys for a span of consecutive families, starting at
// `startKey` and covering `count` families (clamped to the end of the order).
export function familyPhases(startKey, count = 1) {
  const start = FAMILY_ORDER.indexOf(startKey);
  if (start < 0) return [];
  const out = [];
  for (let i = start; i < Math.min(start + count, FAMILY_ORDER.length); i++) {
    out.push(...FAMILIES[FAMILY_ORDER[i]].phases);
  }
  return out;
}

export const PHASES = {
  germination:  { label:"Germination",          color:"#64748b", light:"#e8edf3", dark:"#334155" },
  seedling:     { label:"Seedling",             color:"#38bdf8", light:"#e0f2fe", dark:"#075985" },
  pre:          { label:"Pre-Transplant",       color:"#5b8dee", light:"#e8f0fe", dark:"#1e3a8a" },
  transplant:   { label:"Transplant Day",       color:"#7c3aed", light:"#f3effe", dark:"#4c1d95" },
  early_veg:    { label:"Early Veg",            color:"#22c55e", light:"#dcfce7", dark:"#14532d" },
  veg_cm:       { label:"Veg + Cal-Mag",        color:"#16a34a", light:"#bbf7d0", dark:"#14532d" },
  veg_half:     { label:"Half Dose Feeding",  color:"#15803d", light:"#a7f3d0", dark:"#064e3b" },
  veg_full:     { label:"Full Dose Feeding",  color:"#166534", light:"#6ee7b7", dark:"#022c22" },
  flush:        { label:"Flush Day",            color:"#0ea5e9", light:"#e0f2fe", dark:"#0c4a6e" },
  pre_flower:   { label:"Pre-Flower",           color:"#f59e0b", light:"#fef3c7", dark:"#78350f" },
  flower:       { label:"Flowering",            color:"#f97316", light:"#ffedd5", dark:"#7c2d12" },
  flush_gdp:    { label:"Primary Flush",        color:"#a855f7", light:"#f3e8ff", dark:"#581c87" },
  harvest_gdp:  { label:"Primary Harvest",      color:"#d97706", light:"#fef9c3", dark:"#713f12" },
  flower_haze:  { label:"Late Flower",          color:"#ea580c", light:"#fde8d8", dark:"#7c2d12" },
  flush_haze:   { label:"Late Flush",           color:"#9333ea", light:"#fae8ff", dark:"#581c87" },
  harvest_haze: { label:"Final Harvest",        color:"#b45309", light:"#fef9c3", dark:"#713f12" },
};
