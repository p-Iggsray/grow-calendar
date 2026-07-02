import { getPhase, getDetail } from "./growData.js";
import { api } from "./api.js";

// Tasks are guidance, not homework: any task still unchecked at the end of the
// day quietly completes itself. This sweep runs on load (covering "next load
// after midnight"), fills in "done" for every unresolved task on past days,
// and never touches days the grower marked skipped or blocked.

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Dates strictly after `cursorIso` and strictly before `todayIso`, capped to
// the most recent `cap` days so a long-dormant device doesn't sweep a season.
export function sweepDates(cursorIso, todayIso, cap = 31) {
  const out = [];
  const end = parseLocal(todayIso);
  const d = parseLocal(cursorIso);
  for (;;) {
    d.setDate(d.getDate() + 1);
    if (d >= end) break;
    out.push(ymdLocal(d));
    if (out.length > 400) break; // hard safety
  }
  return out.slice(-cap);
}

let running = false;

export async function autoCompleteTasks({ growId, config, overrides, generatedPlan, phaseOverrides, eventRules, today }) {
  if (running || !growId || !config || !today) return;
  const key = `autoTasks:${growId}`;
  const todayIso = ymdLocal(today);

  let cursor = null;
  try { cursor = localStorage.getItem(key); } catch { /* storage unavailable */ }
  if (!cursor || !/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    // First run: only look back one week.
    const d = parseLocal(todayIso);
    d.setDate(d.getDate() - 8);
    cursor = ymdLocal(d);
  }

  const dates = sweepDates(cursor, todayIso);
  if (dates.length === 0) return;

  running = true;
  try {
    let changedAny = false;
    for (const iso of dates) {
      const dt = parseLocal(iso);
      if (!getPhase(dt, config)) continue;
      const detail = getDetail(dt, config, overrides ?? {}, generatedPlan, phaseOverrides ?? {}, eventRules ?? []);
      const n = detail?.tasks?.length ?? 0;
      if (n === 0) continue;

      let existing = {};
      try {
        const r = await api.getCheckoffs(iso, growId);
        existing = r?.taskStates ?? {};
      } catch { return; /* offline etc: retry next load without moving the cursor */ }

      const next = { ...existing };
      let changed = false;
      for (let i = 0; i < n; i++) {
        const k = String(i);
        if (!next[k]) { next[k] = "done"; changed = true; }
      }
      if (changed) {
        try { await api.putCheckoffs(iso, next, growId); changedAny = true; }
        catch { return; }
      }
    }
    // Everything through yesterday is settled.
    const y = parseLocal(todayIso);
    y.setDate(y.getDate() - 1);
    try { localStorage.setItem(key, ymdLocal(y)); } catch { /* storage unavailable */ }
    if (changedAny) window.dispatchEvent(new CustomEvent("checkoffs-mutated"));
  } finally {
    running = false;
  }
}
