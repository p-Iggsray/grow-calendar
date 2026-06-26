// Pure recurring-event engine. No React, no DOM - safe to import in the Worker.
// Evaluates {window x cadence} rules and returns the task lines firing on a date.
import { daysBetween } from "../dates-core.js";
import { getPhase } from "./phase.js";
import { parseDate } from "../planConfig.js";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function offsetDays(base, days) {
  const out = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  out.setDate(out.getDate() + (days ?? 0));
  return out;
}

function windowMatch(date, config, window) {
  if (!window || typeof window !== "object") return false;
  if (window.type === "range") {
    if (!window.from || !window.to) return false;
    return date >= parseDate(window.from) && date <= parseDate(window.to);
  }
  if (window.type === "phase") {
    const phase = getPhase(date, config);
    return Array.isArray(window.phases) && phase != null && window.phases.includes(phase);
  }
  if (window.type === "milestone") {
    const anchor = config[window.anchor];
    if (!anchor) return false;
    return date >= offsetDays(anchor, window.offsetStart) && date <= offsetDays(anchor, window.offsetEnd);
  }
  return false;
}

function cadenceMatch(date, config, cadence) {
  if (!cadence || typeof cadence !== "object") return false;
  if (cadence.type === "everyDay") return true;
  if (cadence.type === "everyNDays") {
    if (!Number.isInteger(cadence.n) || cadence.n < 1) return false;
    const anchor = cadence.anchor ? parseDate(cadence.anchor) : config.start;
    const diff = daysBetween(date, anchor);
    return diff >= 0 && diff % cadence.n === 0;
  }
  if (cadence.type === "weekdays") {
    return Array.isArray(cadence.days) && cadence.days.includes(WEEKDAY_KEYS[date.getDay()]);
  }
  if (cadence.type === "dates") {
    return Array.isArray(cadence.dates) && cadence.dates.includes(ymd(date));
  }
  return false;
}

export function occurrencesForDate(date, config, eventRules) {
  if (!Array.isArray(eventRules) || eventRules.length === 0) return [];
  const sorted = [...eventRules].sort((a, b) => String(a?.createdAt).localeCompare(String(b?.createdAt)));
  const out = [];
  for (const rule of sorted) {
    if (!rule || rule.enabled === false) continue;
    const datesCadence = rule.cadence?.type === "dates";
    if (!datesCadence && !windowMatch(date, config, rule.window)) continue;
    if (!cadenceMatch(date, config, rule.cadence)) continue;
    if (typeof rule.task === "string" && rule.task.trim()) out.push(rule.task);
  }
  return out;
}
