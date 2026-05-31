// Pure function — no imports, easy to unit test.

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
 * @param {{ detail, checked, threats, contextDate, today }} opts
 *   detail      — day detail object (tasks array), or null when on calendar view
 *   checked     — array of checked task indices for the viewed day
 *   threats     — active threat objects for the viewed phase
 *   contextDate — YYYY-MM-DD of the day open in the app, or null
 *   today       — Date object for today
 */
export function buildSuggestions({ detail, checked, threats, contextDate, today }) {
  const todayYmd = toYmd(today);
  const isToday = !contextDate || contextDate === todayYmd;
  const dayLabel = isToday ? "today" : fmtShort(contextDate);

  const suggestions = [];

  // Slot 1 — task-aware
  if (detail?.tasks?.length > 0) {
    const remaining = detail.tasks.length - (checked?.length ?? 0);
    if (remaining > 0) {
      suggestions.push(
        `Walk me through ${dayLabel}'s ${remaining} remaining task${remaining === 1 ? "" : "s"}`,
      );
    } else {
      suggestions.push(`Everything's checked off for ${dayLabel} — what should I watch for?`);
    }
  } else {
    suggestions.push(`What should I be doing ${dayLabel}?`);
  }

  // Slot 2 — threat-aware or forward-looking
  if (threats?.length > 0) {
    suggestions.push(`Tell me more about the ${threats[0].title} risk right now`);
  } else {
    suggestions.push(`What's coming up this week?`);
  }

  // Slot 3 — note or action prompt
  suggestions.push(
    isToday
      ? `Add a note to today: lower leaves yellowing`
      : `Mark ${dayLabel}'s watering as done`,
  );

  return suggestions;
}
