// Driving dates for the grow plan. Stored in D1 as JSON; this is the seed/default.
// Dates are ISO YYYY-MM-DD strings and MUST be parsed as LOCAL dates (parseDate),
// not via new Date("...") which would parse as UTC and shift the day.
export const DEFAULT_CONFIG = {
  start:        "2026-05-21",
  transplant:   "2026-05-24",
  calMag:       "2026-06-07",
  feedStart:    "2026-06-21",
  fullDose:     "2026-07-05",
  flush1:       "2026-06-24",
  flush2:       "2026-07-24",
  flush3:       "2026-08-24",
  backyardMove: "2026-07-28",
  preFlower:    "2026-08-01",
  flowerStart:  "2026-08-15",
  gdpFlush:     "2026-09-20",
  gdpHarvest:   "2026-09-27",
  hazeFlush:    "2026-10-04",
  hazeHarvest:  "2026-10-18",
};

export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Convert an ISO-string config (from D1 or DEFAULT_CONFIG) into the Date-keyed
// object the generator consumes (same shape as the legacy `D` constant).
export function parseConfig(raw) {
  const out = {};
  for (const [key, iso] of Object.entries(raw)) out[key] = parseDate(iso);
  return out;
}
