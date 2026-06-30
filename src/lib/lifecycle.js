// Post-harvest lifecycle helpers — pure, no React/DOM, safe to import in the
// Cloudflare Worker (like dates-core.js / growData.js).
//
// A grow advances through phases: growing → drying → curing → done. The calendar
// only covers "growing" (start → final harvest); these helpers drive the drying
// and curing trackers that finish the grow. State lives in a grow's `lifecycle`
// JSON field (see worker/grows.js) — never inside `config`, which is date-parsed.
import { daysBetween } from "./dates-core.js";
import { parseDate } from "./planConfig.js";

export const PHASE_ORDER = ["growing", "drying", "curing", "done"];
export const LIFECYCLE_PHASES = new Set(PHASE_ORDER);

// Drying guidance: hang at ~60°F / 60% RH ("60/60"), 7–14 days (target ~10);
// ready when small stems snap instead of bending.
export const DRY_MIN = 7;
export const DRY_TARGET = 10;
export const DRY_MAX = 14;
export const DRY_IDEAL_TEMP_F = 60;
export const DRY_IDEAL_RH = 60;

// Curing guidance: jars at ~62% RH, burp regularly. Min 2 weeks, good at 4,
// premium past 8.
export const CURE_MIN = 14;
export const CURE_GOOD = 28;
export const CURE_MAX = 56;
export const CURE_IDEAL_RH = 62;

export const DRY_CHECKLIST = [
  { key: "smallStemsSnap", label: "Small stems snap (don't bend)" },
  { key: "budsDryOutside", label: "Buds feel dry on the outside" },
  { key: "stemSnap",       label: "Main stem snaps cleanly" },
];

export function defaultLifecycle() {
  return {
    phase: "growing",
    dryStartedAt: null,
    cureStartedAt: null,
    finishedAt: null,
    dryChecklist: {},
    dryLogs: [],
    cureLogs: [],
    finalWeightG: null,
    finalNotes: "",
  };
}

// Normalize whatever came back from the API (may be null on old grows) into a
// usable object, defaulting to the growing phase.
export function normalizeLifecycle(lifecycle) {
  const base = defaultLifecycle();
  if (!lifecycle || typeof lifecycle !== "object") return base;
  return {
    ...base,
    ...lifecycle,
    phase: LIFECYCLE_PHASES.has(lifecycle.phase) ? lifecycle.phase : "growing",
    dryChecklist: lifecycle.dryChecklist && typeof lifecycle.dryChecklist === "object" ? lifecycle.dryChecklist : {},
    dryLogs: Array.isArray(lifecycle.dryLogs) ? lifecycle.dryLogs : [],
    cureLogs: Array.isArray(lifecycle.cureLogs) ? lifecycle.cureLogs : [],
  };
}

export function getLifecyclePhase(lifecycle) {
  const p = lifecycle?.phase;
  return LIFECYCLE_PHASES.has(p) ? p : "growing";
}

export function phaseMeta(phase) {
  switch (phase) {
    case "drying": return { key: "drying", label: "Drying",   tabLabel: "DRYING" };
    case "curing": return { key: "curing", label: "Curing",   tabLabel: "CURING" };
    case "done":   return { key: "done",   label: "Complete", tabLabel: "DONE"   };
    default:       return { key: "growing", label: "Growing", tabLabel: "CALENDAR" };
  }
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Average a numeric field over the most recent `n` log entries (ignoring blanks).
function recentAvg(logs, field, n = 3) {
  const vals = (logs ?? [])
    .map(l => (typeof l?.[field] === "number" ? l[field] : null))
    .filter(v => v != null)
    .slice(-n);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ── Drying ──────────────────────────────────────────────────────────────────
export function dryProgress(lifecycle, today) {
  if (!lifecycle?.dryStartedAt) return null;
  const start = parseDate(lifecycle.dryStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  return {
    dayNum: elapsed + 1,            // the start day is "Day 1"
    elapsed,
    pct: clampPct((elapsed / DRY_MAX) * 100),
    estReadyDate: addDays(start, DRY_TARGET),
    min: DRY_MIN, target: DRY_TARGET, max: DRY_MAX,
  };
}

// Combine the day window, the dryness checklist, and (if logged) the average
// recent RH/temp into a single readiness verdict.
export function dryReadiness(lifecycle, today) {
  if (!lifecycle?.dryStartedAt) return { status: "early", reason: "Drying hasn't started yet." };
  const start = parseDate(lifecycle.dryStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  const stemSnap = lifecycle.dryChecklist?.stemSnap === true;
  const avgRh = recentAvg(lifecycle.dryLogs, "rh");

  if (stemSnap && elapsed >= DRY_MIN) {
    return { status: "ready", reason: "Stems snap and you're past the minimum — jar it up." };
  }
  if (elapsed >= DRY_MAX) {
    return { status: "ready", reason: "Past 14 days — move to jars now to avoid over-drying." };
  }
  if (elapsed >= DRY_MIN) {
    const rhNote = avgRh != null && avgRh > 65 ? " Humidity is a touch high, so check stems before moving." : "";
    return { status: "window", reason: `In the ideal window — move once small stems snap.${rhNote}` };
  }
  const daysLeft = DRY_MIN - elapsed;
  return { status: "early", reason: `Keep drying — about ${daysLeft} more day${daysLeft === 1 ? "" : "s"} before the move window opens.` };
}

// ── Curing ──────────────────────────────────────────────────────────────────
export function cureProgress(lifecycle, today) {
  if (!lifecycle?.cureStartedAt) return null;
  const start = parseDate(lifecycle.cureStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  return {
    dayNum: elapsed + 1,
    elapsed,
    pct: clampPct((elapsed / CURE_GOOD) * 100),
    min: CURE_MIN, good: CURE_GOOD, max: CURE_MAX,
  };
}

// Today's recommended burp cadence based on how long it's been curing.
export function burpCadence(elapsed) {
  if (elapsed < 14) return "Burp jars daily (~10 min) and check moisture.";
  if (elapsed < 28) return "Burp every 2–3 days now.";
  return "Burp about once a week — it's well underway.";
}

export function cureReadiness(lifecycle, today) {
  if (!lifecycle?.cureStartedAt) return { status: "early", reason: "Curing hasn't started yet.", burp: "" };
  const start = parseDate(lifecycle.cureStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  const burp = burpCadence(elapsed);
  if (elapsed < CURE_MIN) {
    const daysLeft = CURE_MIN - elapsed;
    return { status: "early", reason: `Keep curing — ${daysLeft} more day${daysLeft === 1 ? "" : "s"} to reach the 2-week minimum.`, burp };
  }
  if (elapsed < CURE_GOOD) {
    return { status: "window", reason: "Smokable now, but it keeps improving toward the 4-week mark.", burp };
  }
  return { status: "ready", reason: "Well cured — finish whenever you're ready.", burp };
}
