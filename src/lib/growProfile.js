// Per-grow display helpers — derive the location label and strain summary from
// a grow's stored survey / AI-generated plan, so the UI reflects the active
// grow instead of the old hardcoded appConfig constants.

// The location text the grower entered in setup, or "" if none.
export function growLocation(survey) {
  return (survey?.location || "").trim();
}

// Per-plant strain names in entry order. The survey holds one entry per plant;
// the generated plan holds primary/secondary slots. Prefer the survey (it has
// real per-plant counts), falling back to the generated plan.
export function growStrains(survey, generatedPlan) {
  const fromSurvey = (survey?.strains ?? [])
    .map(s => (s?.name || "").trim())
    .filter(Boolean);
  if (fromSurvey.length) return fromSurvey;
  return (generatedPlan?.strains ?? [])
    .map(s => (s?.name || "").trim())
    .filter(Boolean);
}

// Distinct strain names in first-seen order (primary, secondary, …).
export function distinctStrains(survey, generatedPlan) {
  return [...new Set(growStrains(survey, generatedPlan))];
}

// Grouped, counted summary: "1× Grandaddy Purp · 2× Strawberry Haze".
// Returns "" when no strains are known.
export function strainSummary(survey, generatedPlan) {
  const names = growStrains(survey, generatedPlan);
  if (names.length === 0) return "";
  const order = [];
  const counts = new Map();
  for (const n of names) {
    if (!counts.has(n)) order.push(n);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return order.map(n => `${counts.get(n)}× ${n}`).join(" · ");
}

// Compact label for a strain, e.g. "Strawberry Haze" → "SH", "Gelato" → "GEL".
// Multi-word names use first letters (up to 3); single words use first 3 chars.
export function strainShortLabel(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join("").toUpperCase();
}
