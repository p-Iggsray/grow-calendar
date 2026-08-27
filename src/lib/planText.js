import { getPhase, buildMilestones, hasSecondaryStrain } from "./growData.js";

// Compact, LIVE season overview for MJ's system prompt: every milestone with
// its date and phase, plus the season's key dates. MJ uses its tools for
// per-day specifics (journal, log, weather).
export function buildPlanText(config) {
  const lines = ["THE SEASON (live schedule):"];
  for (const m of buildMilestones(config)) {
    const phase = getPhase(m.date, config);
    lines.push(`- ${m.label}: ${ymd(m.date)}${phase ? ` (phase: ${phase})` : ""}`);
  }

  const twoStrain = hasSecondaryStrain(config);
  const keyDates = [
    ["fullDose", "Full-dose feeding begins"],
    ["flush1", "Routine flush #1"],
    ["flush2", "Routine flush #2"],
    ["flush3", "Routine flush #3"],
    ["gdpFlush", twoStrain ? "Primary-strain pre-harvest flush begins" : "Pre-harvest flush begins"],
  ];
  // Only a genuine second strain gets its own later flush date.
  if (twoStrain) keyDates.push(["hazeFlush", "Later-strain pre-harvest flush begins"]);
  lines.push("\nKEY DATES:");
  for (const [key, label] of keyDates) {
    lines.push(`- ${label}: ${ymd(config[key])}`);
  }

  return lines.join("\n");
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
