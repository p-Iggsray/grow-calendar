// Post-harvest lifecycle helpers - pure, no React/DOM, safe to import in the
// Cloudflare Worker (like dates-core.js / growData.js).
//
// A grow advances through phases: growing → drying → curing → done. The calendar
// only covers "growing" (start → final harvest); these helpers drive the drying
// and curing trackers that finish the grow. State lives in a grow's `lifecycle`
// JSON field (see worker/grows.js) - never inside `config`, which is date-parsed.
import { daysBetween } from "./dates-core.js";
import { parseDate } from "./dates-core.js";
import { cropOf } from "./crops.js";

export const PHASE_ORDER = ["growing", "drying", "curing", "done"];
export const LIFECYCLE_PHASES = new Set(PHASE_ORDER);

// What happens after the harvest, per crop. Cannabis dries slowly and then
// cures for weeks in jars; mushrooms dry fast, all the way to cracker dry, and
// then they are simply stored. So a monotub has no curing phase at all - not a
// shorter one, none - and its drying is measured in a day or two rather than
// a fortnight.
export const CROP_PHASES = {
  cannabis: ["growing", "drying", "curing", "done"],
  mushrooms: ["growing", "drying", "done"],
};

const DRY_GUIDE = {
  // Hang at ~60F / 60% RH ("60/60"), 7-14 days, ready when small stems snap.
  cannabis: {
    min: 7, target: 10, max: 14, idealTempF: 60, idealRh: 60,
    window: "7-14 day window",
    ideal: "Ideal ~60°F / 60% RH",
    checklist: [
      { key: "smallStemsSnap", label: "Small stems snap (don't bend)" },
      { key: "budsDryOutside", label: "Buds feel dry on the outside" },
      { key: "stemSnap",       label: "Main stem snaps cleanly" },
    ],
    ready: "Stems snap and you're past the minimum - jar it up.",
    overdue: "Past 14 days - move to jars now to avoid over-drying.",
    windowNote: "In the ideal window - move once small stems snap.",
    nextLabel: "Move to curing",
  },
  // Dehydrator at ~110-125F, or a fan and desiccant. Done when they snap
  // rather than bend - anything softer will not keep.
  mushrooms: {
    min: 1, target: 2, max: 4, idealTempF: 115, idealRh: 30,
    window: "1-4 day window",
    ideal: "Ideal ~110-125°F in a dehydrator, or a fan and desiccant",
    checklist: [
      { key: "capsShrunk",  label: "Caps shrunk and lightened" },
      { key: "stemsSnap",   label: "Stems snap, they do not bend" },
      { key: "crackerDry",  label: "Cracker dry all the way through" },
    ],
    ready: "Snapping clean and past the minimum - jar them with desiccant.",
    overdue: "Past four days - they are as dry as they are going to get.",
    windowNote: "Nearly there - keep going until a stem snaps rather than bends.",
    nextLabel: "Store them",
  },
};

/** The phases this crop moves through after growing. */
export function phaseOrder(crop) {
  return CROP_PHASES[cropOf(crop)];
}

/** Drying targets and copy for this crop. */
export function dryGuide(crop) {
  return DRY_GUIDE[cropOf(crop)];
}

/** What comes after drying: jars for cannabis, the shelf for mushrooms. */
export function phaseAfterDrying(crop) {
  return cropOf(crop) === "mushrooms" ? "done" : "curing";
}

// Kept for the cannabis screens that read them directly.
export const DRY_MIN = DRY_GUIDE.cannabis.min;
export const DRY_MAX = DRY_GUIDE.cannabis.max;
// Curing guidance: jars at ~62% RH, burp regularly. Min 2 weeks, good at 4,
// premium past 8. Cannabis only - nothing cures a mushroom.
export const CURE_MIN = 14;
export const CURE_GOOD = 28;
export const CURE_MAX = 56;
export const CURE_IDEAL_RH = 62;

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
export function dryProgress(lifecycle, today, crop) {
  if (!lifecycle?.dryStartedAt) return null;
  const g = dryGuide(crop);
  const start = parseDate(lifecycle.dryStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  return {
    dayNum: elapsed + 1,            // the start day is "Day 1"
    elapsed,
    pct: clampPct((elapsed / g.max) * 100),
    estReadyDate: addDays(start, g.target),
    min: g.min, target: g.target, max: g.max,
  };
}

// Combine the day window, the dryness checklist, and (if logged) the average
// recent RH/temp into a single readiness verdict.
export function dryReadiness(lifecycle, today, crop) {
  if (!lifecycle?.dryStartedAt) return { status: "early", reason: "Drying hasn't started yet." };
  const g = dryGuide(crop);
  const start = parseDate(lifecycle.dryStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  // The last box on the list is the one that settles it, whichever crop it is:
  // a main stem that snaps, or a fruit that is cracker dry.
  const snapped = lifecycle.dryChecklist?.[g.checklist[g.checklist.length - 1].key] === true;
  const avgRh = recentAvg(lifecycle.dryLogs, "rh");

  if (snapped && elapsed >= g.min) {
    return { status: "ready", reason: g.ready };
  }
  if (elapsed >= g.max) {
    return { status: "ready", reason: g.overdue };
  }
  if (elapsed >= g.min) {
    const rhNote = avgRh != null && avgRh > 65 ? " Humidity is a touch high, so check before moving." : "";
    return { status: "window", reason: `${g.windowNote}${rhNote}` };
  }
  const daysLeft = g.min - elapsed;
  return { status: "early", reason: `Keep drying - about ${daysLeft} more day${daysLeft === 1 ? "" : "s"} before the move window opens.` };
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
  if (elapsed < 28) return "Burp every 2-3 days now.";
  return "Burp about once a week - it's well underway.";
}

export function cureReadiness(lifecycle, today) {
  if (!lifecycle?.cureStartedAt) return { status: "early", reason: "Curing hasn't started yet.", burp: "" };
  const start = parseDate(lifecycle.cureStartedAt);
  const elapsed = Math.max(0, daysBetween(today, start));
  const burp = burpCadence(elapsed);
  if (elapsed < CURE_MIN) {
    const daysLeft = CURE_MIN - elapsed;
    return { status: "early", reason: `Keep curing - ${daysLeft} more day${daysLeft === 1 ? "" : "s"} to reach the 2-week minimum.`, burp };
  }
  if (elapsed < CURE_GOOD) {
    return { status: "window", reason: "Smokable now, but it keeps improving toward the 4-week mark.", burp };
  }
  return { status: "ready", reason: "Well cured - finish whenever you're ready.", burp };
}
