import { useState } from "react";
import { Plus, Sprout, ChevronRight } from "lucide-react";
import { usePlan } from "../lib/usePlan.jsx";
import { parseConfig } from "../lib/planConfig.js";
import { getPhase, PHASES } from "../lib/growData.js";
import { api } from "../lib/api.js";

const MONO  = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";

const STATUS_META = {
  active:    { label: "ACTIVE",    color: "var(--c-accent)",   bg: "rgba(74,222,128,0.10)",   border: "rgba(74,222,128,0.25)" },
  harvested: { label: "HARVESTED", color: "#f59e0b",           bg: "rgba(245,158,11,0.10)",   border: "rgba(245,158,11,0.25)" },
  abandoned: { label: "ABANDONED", color: "var(--c-text-ghost)", bg: "rgba(100,100,100,0.10)", border: "rgba(100,100,100,0.25)" },
};

function ms(a, b) {
  return Math.round((a - b) / 86400000);
}

function GrowCard({ grow, isActive, onSetActive, onViewPlan, today }) {
  const st = STATUS_META[grow.status] ?? STATUS_META.active;

  let phaseName = null;
  let daysSince = null;
  let progress = 0;
  let daysLeft = null;

  if (grow.config) {
    try {
      const cfg = parseConfig(grow.config);
      const phase = getPhase(today, cfg);
      if (phase) phaseName = PHASES[phase]?.label ?? phase;
      const transplant = cfg.transplant;
      const endDate = cfg.hazeHarvest;
      if (transplant && endDate) {
        daysSince = Math.max(0, ms(today, transplant));
        const total = ms(endDate, transplant);
        progress = total > 0 ? Math.min(100, Math.round((daysSince / total) * 100)) : 100;
        daysLeft = ms(endDate, today);
      }
    } catch { /* ignore parse errors */ }
  }

  const strainNames = grow.generatedPlan?.strains?.map(s => s.name).filter(Boolean)
    ?? grow.survey?.strains?.map(s => s.name).filter(Boolean)
    ?? [];

  return (
    <div style={{
      background: "var(--c-surface-1)",
      border: `1px solid ${isActive ? "var(--c-accent)" : "var(--c-border)"}`,
      borderRadius: 14,
      padding: "16px",
      position: "relative",
      transition: "border-color 0.2s",
    }}>
      {/* Top row: status badge + current chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
          padding: "3px 7px", borderRadius: 4,
          color: st.color, background: st.bg, border: `1px solid ${st.border}`,
        }}>
          {st.label}
        </span>
        {isActive && (
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
            padding: "3px 7px", borderRadius: 4,
            color: "var(--c-accent)", background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.3)",
          }}>
            CALENDAR
          </span>
        )}
      </div>

      {/* Grow name */}
      <div style={{ fontFamily: SERIF, fontSize: 17, color: "var(--c-text)", marginBottom: 3, lineHeight: 1.25 }}>
        {grow.displayName || "Unnamed Grow"}
      </div>

      {/* Strain names */}
      {strainNames.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-faint)", marginBottom: 10, letterSpacing: 0.4 }}>
          {strainNames.join(" · ")}
        </div>
      )}

      {/* Phase + day count */}
      {grow.config && (
        <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          {phaseName && (
            <div style={{
              fontFamily: MONO, fontSize: 10, color: "var(--c-text-muted)",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--c-border)",
              borderRadius: 6, padding: "3px 8px", letterSpacing: 0.4,
            }}>
              {phaseName}
            </div>
          )}
          {daysSince !== null && (
            <div style={{
              fontFamily: MONO, fontSize: 10, color: "var(--c-text-muted)",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--c-border)",
              borderRadius: 6, padding: "3px 8px", letterSpacing: 0.4,
            }}>
              Day {daysSince}
              {daysLeft !== null && daysLeft > 0 && ` · ${daysLeft}d left`}
              {daysLeft !== null && daysLeft <= 0 && " · done"}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {grow.config && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 4, background: "var(--c-border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: grow.status === "active" ? "var(--c-accent)" : st.color,
              width: `${progress}%`, transition: "width 0.4s",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 3 }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)" }}>{progress}%</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {!isActive && (
          <button
            type="button"
            className="touch-target"
            onClick={() => onSetActive(grow.id)}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 8,
              background: "rgba(74,222,128,0.07)",
              border: "1px solid rgba(74,222,128,0.2)",
              color: "var(--c-accent)", fontFamily: MONO, fontSize: 11,
              letterSpacing: 0.5, cursor: "pointer",
            }}>
            Use for calendar
          </button>
        )}
        <button
          type="button"
          className="touch-target"
          onClick={() => onViewPlan(grow.id)}
          style={{
            flex: isActive ? 2 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "9px 12px", borderRadius: 8,
            background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11,
            letterSpacing: 0.5, cursor: "pointer",
          }}>
          View plan
          <ChevronRight size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

export default function GrowsDashboard({ today, onViewPlan, onStartNewGrow }) {
  const { grows, activeGrowId, setActiveGrowId } = usePlan();
  const [creating, setCreating] = useState(false);

  async function handleNewGrow() {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await api.createGrow({ displayName: "New Grow" });
      onStartNewGrow(id);
    } catch {
      // silently ignore; user can retry
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Sprout size={16} strokeWidth={1.6} style={{ color: "var(--c-text-ghost)" }} />
        <span style={{ fontFamily: SERIF, fontSize: 20, color: "var(--c-text)" }}>My Grows</span>
      </div>

      {/* Grow cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        {grows.map(grow => (
          <GrowCard
            key={grow.id}
            grow={grow}
            isActive={grow.id === activeGrowId}
            today={today}
            onSetActive={(id) => setActiveGrowId(id)}
            onViewPlan={onViewPlan}
          />
        ))}
      </div>

      {/* Start new grow */}
      <button
        type="button"
        className="touch-target"
        onClick={handleNewGrow}
        disabled={creating}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "14px",
          background: creating ? "rgba(34,197,94,0.04)" : "rgba(34,197,94,0.08)",
          border: "1.5px dashed rgba(34,197,94,0.3)",
          borderRadius: 12, cursor: creating ? "default" : "pointer",
          color: creating ? "var(--c-text-ghost)" : "var(--c-accent)",
          fontFamily: MONO, fontSize: 12, letterSpacing: 1,
          transition: "all 0.15s",
        }}>
        <Plus size={14} strokeWidth={1.8} />
        {creating ? "Creating…" : "Start New Grow"}
      </button>

      {/* Empty state hint */}
      {grows.length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)",
          letterSpacing: 0.5, lineHeight: 1.8,
        }}>
          No grows yet.{"\n"}Tap Start New Grow to begin your first calendar.
        </div>
      )}
    </div>
  );
}
