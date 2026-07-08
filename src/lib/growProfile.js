// Per-grow display helpers - derive the location label and strain summary from
// a grow's stored survey / AI-generated plan, so the UI reflects the active
// grow instead of the old hardcoded appConfig constants.

// The location text the grower entered in setup, or "" if none.
export function growLocation(survey) {
  return (survey?.location || "").trim();
}

// Does this grow have a usable location for auto weather: coordinates, or a
// place name the server can geocode? (Guards against null/"" coercing to 0.)
function isCoord(v) {
  return (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v));
}
export function hasGrowLocation(survey) {
  if (!survey) return false;
  if (isCoord(survey.lat) && isCoord(survey.lon)) return true;
  return growLocation(survey).length > 0;
}

// Per-plant strain names in entry order. The survey's strain roster is the
// single source of truth: the backend seeds it from the AI plan on load (see
// backfillStrainsFromPlan), so there is never a plant on the calendar that is
// not in this list.
export function growStrains(survey) {
  return (survey?.strains ?? [])
    .map(s => (s?.name || "").trim())
    .filter(Boolean);
}

// Distinct strain names in first-seen order (primary, secondary, …).
export function distinctStrains(survey) {
  return [...new Set(growStrains(survey))];
}

// Grouped, counted summary: "1× Grandaddy Purp · 2× Strawberry Haze".
// Returns "" when no strains are known.
export function strainSummary(survey) {
  const names = growStrains(survey);
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
