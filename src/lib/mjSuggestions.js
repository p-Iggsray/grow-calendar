// Pure function - no imports, easy to unit test.

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtShort(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Build three contextual suggestion chips for MJ's empty state.
 *
 * @param {{ contextDate, today, phaseLabel }} opts
 *   contextDate - YYYY-MM-DD of the journal day open in the app, or null
 *   today - Date object for today
 *   phaseLabel - label of today's phase ("Early Veg"), or null off-season
 */
export function buildSuggestions({ contextDate, today, phaseLabel }) {
  const todayYmd = toYmd(today);
  const isToday = !contextDate || contextDate === todayYmd;
  const dayLabel = isToday ? "today" : fmtShort(contextDate);

  const suggestions = [];

  // Slot 1 - phase-aware check-in
  suggestions.push(
    phaseLabel
      ? `How should my plants look in ${phaseLabel.toLowerCase()}?`
      : "How is my grow doing?",
  );

  // Slot 2 - forward-looking
  suggestions.push("What's coming up this week?");

  // Slot 3 - journal-aware
  suggestions.push(
    isToday
      ? "Summarize my journal from the past week"
      : `What happened around ${dayLabel}?`,
  );

  return suggestions;
}
