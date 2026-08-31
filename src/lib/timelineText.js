import { dayOfGrow, stageLabel, stageOnDate } from "./stageTimeline.js";

// A plain-text summary of what a grow has actually done, for MJ's system
// prompt. It is a history, not a plan: every line is a stage the grower
// recorded moving into, on the day they said it happened. Pure + unit tested.
export function buildTimelineText(events = [], firstDate = null, todayKey = null) {
  if (!firstDate || events.length === 0) {
    return "GROW TIMELINE: nothing recorded yet. This grow has no calendar until the grower moves a plant into a stage on the Plants tab. Do not invent dates for it.";
  }

  const lines = ["GROW TIMELINE (recorded, not predicted):"];
  for (const e of events) {
    const day = dayOfGrow(firstDate, e.date);
    lines.push(`- ${e.date}${day != null ? ` (day ${day})` : ""}: moved to ${stageLabel(e.stage)}`);
  }

  if (todayKey) {
    const stage = stageOnDate(events, todayKey);
    const day = dayOfGrow(firstDate, todayKey);
    lines.push(
      stage
        ? `Today (${todayKey}) is day ${day} and the grow is in ${stageLabel(stage)}.`
        : `Today (${todayKey}) is before this grow started in the app.`,
    );
  }

  lines.push("There are no scheduled or estimated dates in this app. If you give the grower a projection, say clearly that it is your own estimate.");
  return lines.join("\n");
}
