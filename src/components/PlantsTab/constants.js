export const MONO = "'Courier New', monospace";
export const SERIF = "'Georgia', 'Times New Roman', serif";

export const TYPE_LABEL = { indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" };

// Manual per-plant lifecycle stages (mirror of worker/plantsRoster.js PLANT_STAGES).
export const STAGE_OPTIONS = [
  { value: "seedling",   label: "Seedling" },
  { value: "vegetative", label: "Vegetative" },
  { value: "flowering",  label: "Flowering" },
  { value: "flushing",   label: "Flushing" },
  { value: "harvest",    label: "Harvest" },
  { value: "drying",     label: "Drying" },
  { value: "curing",     label: "Curing" },
  { value: "done",       label: "Done" },
];
export const STAGE_ORDER = STAGE_OPTIONS.map((o) => o.value);
export function stageLabel(stage) {
  return STAGE_OPTIONS.find((s) => s.value === stage)?.label ?? "Seedling";
}
function stageIndex(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}
export function nextStage(stage) {
  return STAGE_ORDER[Math.min(STAGE_ORDER.length - 1, stageIndex(stage) + 1)];
}
export function prevStage(stage) {
  return STAGE_ORDER[Math.max(0, stageIndex(stage) - 1)];
}

export const HEALTH_OPTIONS = [
  { value: "thriving", label: "Thriving", color: "var(--c-accent)" },
  { value: "healthy",  label: "Healthy",  color: "var(--c-text-dim)" },
  { value: "stressed", label: "Stressed", color: "var(--c-warn)" },
  { value: "sick",     label: "Sick",     color: "var(--c-danger)" },
];
export const HEALTH_MAP = Object.fromEntries(HEALTH_OPTIONS.map((o) => [o.value, o]));

// Per-plant history categories. Order drives the filter row. "stage" is produced
// by the stage control, not the entry form.
export const LOG_KINDS = [
  { value: "note",        label: "Note" },
  { value: "measurement", label: "Measurement" },
  { value: "watering",    label: "Watering" },
  { value: "nutrients",   label: "Nutrients" },
  { value: "training",    label: "Training" },
  { value: "trim",        label: "Trim" },
  { value: "environment", label: "Environment" },
  { value: "health",      label: "Health" },
  { value: "stage",       label: "Stage" },
];
export const FORM_KINDS = LOG_KINDS.filter((k) => k.value !== "stage");
export const KIND_LABEL = Object.fromEntries(LOG_KINDS.map((k) => [k.value, k.label]));
export function kindLabel(kind) { return KIND_LABEL[kind] ?? "Note"; }

// One-line summary of an entry's category-specific detail, for the history list.
export function summarizeEntry(e) {
  const d = e.detail ?? {};
  switch (e.kind) {
    case "measurement": return e.height != null ? `${e.height}${e.height_unit || ""}` : "";
    case "watering": {
      const parts = [];
      if (d.gal) parts.push(`${d.gal} gal`);
      if (d.ec_in) parts.push(`EC in ${d.ec_in}`);
      if (d.ec_out) parts.push(`EC out ${d.ec_out}`);
      return parts.join(" · ");
    }
    case "nutrients": return [d.mix, d.dose].filter(Boolean).join(" — ");
    case "training":  return d.action || "";
    case "environment": {
      const parts = [];
      if (d.temp_high || d.temp_low) parts.push(`${d.temp_high ?? "?"}/${d.temp_low ?? "?"}°F`);
      if (d.humidity) parts.push(`${d.humidity}% RH`);
      return parts.join(" · ");
    }
    case "health": {
      if (e.health) return HEALTH_MAP[e.health]?.label ?? "";
      const parts = [];
      if (d.color) parts.push(d.color);
      if (d.trichomes) parts.push(`${d.trichomes} trichomes`);
      return parts.join(" · ");
    }
    default: return "";
  }
}

// Split a grow's strain roster into active (growing) and archived plants.
export function partitionPlants(survey) {
  const strains = Array.isArray(survey?.strains) ? survey.strains : [];
  const active = [];
  const archived = [];
  for (const p of strains) {
    if (p.status === "harvested" || p.status === "dead") archived.push(p);
    else active.push(p);
  }
  return { active, archived };
}

// Most recent height + health from a plant's log entries (already date DESC).
export function latestMetrics(entries) {
  let height = null;
  let heightUnit = null;
  let health = null;
  let lastDate = null;
  for (const e of entries ?? []) {
    if (lastDate == null) lastDate = e.date;
    if (height == null && e.height != null) { height = e.height; heightUnit = e.height_unit; }
    if (health == null && e.health) health = e.health;
    if (height != null && health != null) break;
  }
  return { height, heightUnit, health, lastDate };
}
