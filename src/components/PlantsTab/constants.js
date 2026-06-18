export const MONO = "'Courier New', monospace";
export const SERIF = "'Georgia', 'Times New Roman', serif";

export const TYPE_LABEL = { indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" };

export const HEALTH_OPTIONS = [
  { value: "thriving", label: "Thriving", color: "var(--c-accent)" },
  { value: "healthy",  label: "Healthy",  color: "var(--c-text-dim)" },
  { value: "stressed", label: "Stressed", color: "var(--c-warn)" },
  { value: "sick",     label: "Sick",     color: "var(--c-danger)" },
];
export const HEALTH_MAP = Object.fromEntries(HEALTH_OPTIONS.map((o) => [o.value, o]));

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
