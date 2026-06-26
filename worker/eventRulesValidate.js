import { VALID_GROW_PHASES, VALID_CONFIG_DATE_KEYS } from "./mj-logic.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_TYPES = new Set(["range", "phase", "milestone"]);
const CADENCE_TYPES = new Set(["everyDay", "everyNDays", "weekdays", "dates"]);
const WEEKDAYS = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
const MAX_TASK_LEN = 200;
const MAX_LABEL_LEN = 80;

export const MAX_RULES_PER_GROW = 50;

// Returns null when valid, otherwise a short error message.
export function validateEventRule(rule) {
  if (!rule || typeof rule !== "object") return "rule must be an object";
  if (typeof rule.task !== "string" || !rule.task.trim()) return "task is required";
  if (rule.task.length > MAX_TASK_LEN) return `task exceeds ${MAX_TASK_LEN} characters`;
  if (rule.label != null && (typeof rule.label !== "string" || rule.label.length > MAX_LABEL_LEN)) {
    return `label must be a string up to ${MAX_LABEL_LEN} characters`;
  }

  const cad = rule.cadence;
  if (!cad || typeof cad !== "object" || !CADENCE_TYPES.has(cad.type)) return "cadence.type is invalid";
  if (cad.type === "everyNDays") {
    if (!Number.isInteger(cad.n) || cad.n < 1) return "cadence.n must be a positive integer";
    if (cad.anchor != null && !DATE_RE.test(cad.anchor)) return "cadence.anchor must be YYYY-MM-DD";
  }
  if (cad.type === "weekdays" && (!Array.isArray(cad.days) || cad.days.length === 0 || cad.days.some(d => !WEEKDAYS.has(d)))) {
    return "cadence.days must be weekday keys (mon..sun)";
  }
  if (cad.type === "dates" && (!Array.isArray(cad.dates) || cad.dates.length === 0 || cad.dates.some(d => !DATE_RE.test(d)))) {
    return "cadence.dates must be a non-empty list of YYYY-MM-DD strings";
  }

  // window is required unless the cadence is an explicit date list.
  if (cad.type !== "dates") {
    const w = rule.window;
    if (!w || typeof w !== "object" || !WINDOW_TYPES.has(w.type)) return "window.type is invalid";
    if (w.type === "range") {
      if (!DATE_RE.test(w.from || "") || !DATE_RE.test(w.to || "")) return "window range needs from/to as YYYY-MM-DD";
    } else if (w.type === "phase") {
      if (!Array.isArray(w.phases) || w.phases.length === 0 || w.phases.some(p => !VALID_GROW_PHASES.has(p))) {
        return "window.phases must be valid phase keys";
      }
    } else if (w.type === "milestone") {
      if (!VALID_CONFIG_DATE_KEYS.has(w.anchor)) return "window.anchor must be a config date key";
      if (!Number.isInteger(w.offsetStart) || !Number.isInteger(w.offsetEnd)) return "window offsets must be integers";
    }
  }
  return null;
}
