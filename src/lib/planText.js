import { getPhase, getDetail, buildMilestones, THREATS } from "./growData.js";

// Compact, LIVE season overview for MJ's system prompt. Sampled from the generator
// at milestone dates so dosing language comes from the generated task text (single
// source), not hand-authored prose. MJ uses the get_day tool for per-day specifics.
export function buildPlanText(config, overrides, generatedPlan, phaseOverrides) {
  const lines = ["THE GROW PLAN (live schedule):"];
  for (const m of buildMilestones(config)) {
    const detail = getDetail(m.date, config, overrides, generatedPlan, phaseOverrides);
    if (!detail) continue;
    const phase = getPhase(m.date, config);
    lines.push(`\n- ${m.label} (${ymd(m.date)}, phase: ${phase}): ${detail.summary}`);
    for (const t of detail.tasks.slice(0, 4)) lines.push(`    • ${t}`);
  }

  const keyDates = {
    fullDose: "Full-dose feeding begins",
    flush1: "Routine flush #1",
    flush2: "Routine flush #2",
    flush3: "Routine flush #3",
    gdpFlush: "GDP pre-harvest flush begins",
    hazeFlush: "Haze pre-harvest flush begins",
  };
  lines.push("\nKEY DATES:");
  for (const [key, label] of Object.entries(keyDates)) {
    lines.push(`- ${label}: ${ymd(config[key])}`);
  }

  lines.push("\nSEASON THREATS:");
  for (const t of THREATS) lines.push(`- ${t.title}: ${t.desc}`);

  return lines.join("\n");
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
