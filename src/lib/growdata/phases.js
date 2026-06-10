// Single-character glyph per phase so the calendar is readable without color
// (WCAG 1.4.1). Same-color/different-strain phases share a glyph and rely on
// the surrounding date + aria-label to disambiguate.
export function phaseGlyph(phase) {
  if (!phase) return "";
  if (phase === "pre") return "";
  if (phase === "transplant") return "T";
  if (phase.startsWith("veg") || phase === "early_veg") return "V";
  if (phase.startsWith("flush")) return "~";
  if (phase.startsWith("harvest")) return "H";
  if (phase.startsWith("flower") || phase === "pre_flower") return "F";
  return "";
}

export const PHASES = {
  pre:          { label:"Pre-Transplant",       color:"#5b8dee", light:"#e8f0fe", dark:"#1e3a8a" },
  transplant:   { label:"Transplant Day",       color:"#7c3aed", light:"#f3effe", dark:"#4c1d95" },
  early_veg:    { label:"Early Veg",            color:"#22c55e", light:"#dcfce7", dark:"#14532d" },
  veg_cm:       { label:"Veg + Cal-Mag",        color:"#16a34a", light:"#bbf7d0", dark:"#14532d" },
  veg_half:     { label:"Feeding — Half Dose",  color:"#15803d", light:"#a7f3d0", dark:"#064e3b" },
  veg_full:     { label:"Feeding — Full Dose",  color:"#166534", light:"#6ee7b7", dark:"#022c22" },
  flush:        { label:"Flush Day",            color:"#0ea5e9", light:"#e0f2fe", dark:"#0c4a6e" },
  pre_flower:   { label:"Pre-Flower",           color:"#f59e0b", light:"#fef3c7", dark:"#78350f" },
  flower:       { label:"Flowering",            color:"#f97316", light:"#ffedd5", dark:"#7c2d12" },
  flush_gdp:    { label:"Primary Flush",        color:"#a855f7", light:"#f3e8ff", dark:"#581c87" },
  harvest_gdp:  { label:"Primary Harvest",      color:"#d97706", light:"#fef9c3", dark:"#713f12" },
  flower_haze:  { label:"Late Flower",          color:"#ea580c", light:"#fde8d8", dark:"#7c2d12" },
  flush_haze:   { label:"Late Flush",           color:"#9333ea", light:"#fae8ff", dark:"#581c87" },
  harvest_haze: { label:"Final Harvest",        color:"#b45309", light:"#fef9c3", dark:"#713f12" },
};
