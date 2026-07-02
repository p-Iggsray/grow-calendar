// Shared building blocks for the post-harvest phase trackers (drying, curing,
// done). Mobile-first: single column, big touch targets, safe-area padding.
import { useCallback, useState } from "react";
import { api } from "../../lib/api.js";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToast } from "../../lib/useToast.jsx";
import { normalizeLifecycle } from "../../lib/lifecycle.js";
import { successHaptic } from "../../lib/haptics.js";

export const MONO = "var(--font-ui)";
export const SERIF = "var(--font-ui)";

// Local YYYY-MM-DD (matches parseDate's local-date contract - never toISOString,
// which would shift the day in negative-offset timezones).
export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Saves a (partial) lifecycle change for the active grow and refreshes plan
// state. `patch` is shallow-merged onto the current normalized lifecycle.
export function useLifecycleSave() {
  const { activeGrowId, lifecycle, reload } = usePlan();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const save = useCallback(async (patch) => {
    if (!activeGrowId || busy) return false;
    const next = { ...normalizeLifecycle(lifecycle), ...patch };
    setBusy(true);
    try {
      await api.updateGrowLifecycle(activeGrowId, next);
      successHaptic();
      await reload();
      return true;
    } catch (err) {
      addToast(`Couldn't save: ${err?.message ?? "unknown error"}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [activeGrowId, lifecycle, reload, addToast, busy]);

  return { save, busy };
}

export function PhaseScreen({ children }) {
  return (
    <div style={{
      paddingTop: "calc(18px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 24,
      display: "flex", flexDirection: "column", gap: 14,
      fontFamily: SERIF, color: "var(--c-text)",
    }}>
      {children}
    </div>
  );
}

export function Card({ children, style }) {
  return (
    <div className="card" style={{ padding: 18, ...style }}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, color }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
      color: color ?? "var(--c-text-ghost)", marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// The hero counter: a big day number + caption.
export function DayHero({ dayNum, caption, accent = "var(--c-accent)" }) {
  return (
    <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: "var(--c-text-faint)", textTransform: "uppercase" }}>
        Day
      </div>
      <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, color: accent, letterSpacing: -2 }}>
        {dayNum}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--c-text-dim)", marginTop: 6 }}>{caption}</div>
    </div>
  );
}

export function ProgressBar({ pct, accent = "var(--c-accent)" }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: "var(--c-surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: accent, transition: "width 0.3s" }} />
    </div>
  );
}

const STATUS_TONE = {
  ready:  { bg: "rgba(34,197,94,0.14)",  border: "rgba(34,197,94,0.4)",  color: "var(--c-accent)" },
  window: { bg: "rgba(245,158,11,0.14)", border: "rgba(245,158,11,0.4)", color: "#f59e0b" },
  early:  { bg: "var(--c-surface-2)",    border: "var(--c-border)",      color: "var(--c-text-faint)" },
};

export function ReadyBadge({ status, children }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.early;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: t.bg, border: `1px solid ${t.border}`, color: t.color,
      borderRadius: 999, padding: "5px 12px",
      fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

// Big primary action button used for phase transitions.
export function CTAButton({ onClick, disabled, emphasized, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "15px 16px", borderRadius: 14,
        background: emphasized ? "#22c55e" : "var(--c-surface-2)",
        border: emphasized ? "none" : "1px solid var(--c-border)",
        color: emphasized ? "var(--c-bg)" : "var(--c-text-dim)",
        fontFamily: MONO, fontSize: 15, fontWeight: 600, letterSpacing: 0.2,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        minHeight: 50, transition: "opacity 0.15s",
      }}>
      {children}
    </button>
  );
}

export function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-num)", fontSize: 17, fontWeight: 700, color: "var(--c-text)" }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
    </div>
  );
}
