import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { api } from "../lib/api.js";

const MONO  = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";

const STATUS_STYLE = {
  active:    { label: "ACTIVE",    color: "var(--c-accent)",     bg: "rgba(74,222,128,0.12)"  },
  harvested: { label: "HARVESTED", color: "var(--c-warn)",             bg: "rgba(251,191,36,0.10)"  },
  abandoned: { label: "ABANDONED", color: "var(--c-text-ghost)", bg: "rgba(255,255,255,0.04)" },
};

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

function GrowCard({ grow, isActive, onActivate }) {
  const ss = STATUS_STYLE[grow.status] ?? STATUS_STYLE.active;
  const strains = grow.survey?.strains?.map(s => s.name).filter(Boolean) ?? [];
  const cfg     = grow.config;

  const transplantDate = cfg?.transplant  ? fmtDate(cfg.transplant)  : null;
  const harvestDate    = cfg?.hazeHarvest ? fmtDate(cfg.hazeHarvest)
                       : cfg?.gdpHarvest  ? fmtDate(cfg.gdpHarvest)  : null;

  return (
    <button
      type="button"
      onClick={() => { if (!isActive) onActivate(grow.id); }}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: 18, borderRadius: 16,
        background: isActive ? "rgba(74,222,128,0.07)" : "var(--c-surface-1)",
        border: `1.5px solid ${isActive ? "rgba(74,222,128,0.4)" : "var(--c-border)"}`,
        cursor: isActive ? "default" : "pointer",
        transition: "border-color 0.2s, background 0.2s",
        opacity: grow.status === "abandoned" ? 0.65 : 1,
      }}
    >
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: strains.length > 0 || transplantDate || harvestDate ? 10 : 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)", fontFamily: SERIF, letterSpacing: -0.3, lineHeight: 1.2, flex: 1 }}>
          {grow.displayName || "Unnamed Grow"}
        </div>
        <div style={{
          padding: "4px 9px", borderRadius: 6, flexShrink: 0,
          background: ss.bg, color: ss.color,
          fontFamily: MONO, fontSize: 11, letterSpacing: 1.5,
        }}>
          {ss.label}
        </div>
      </div>

      {/* Strains */}
      {strains.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", marginBottom: 10, letterSpacing: 0.3 }}>
          {strains.join(" · ")}
        </div>
      )}

      {/* Dates */}
      {(transplantDate || harvestDate) && (
        <div style={{ display: "flex", gap: 20, marginBottom: isActive ? 10 : 0 }}>
          {transplantDate && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 2 }}>Transplant</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)" }}>{transplantDate}</div>
            </div>
          )}
          {harvestDate && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 2 }}>Est. Harvest</div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)" }}>{harvestDate}</div>
            </div>
          )}
        </div>
      )}

      {/* No config yet */}
      {!cfg && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 4 }}>
          Setup not complete
        </div>
      )}

      {/* Calendar-active badge */}
      {isActive && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: MONO, fontSize: 11, letterSpacing: 1.5,
          color: "var(--c-accent)", textTransform: "uppercase",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0 }} />
          Calendar active
        </div>
      )}
    </button>
  );
}

export default function GrowsListTab({ grows, activeGrowId, setActiveGrowId, onNewGrow, onEditGrow }) {
  const [creating, setCreating] = useState(false);

  async function handleNewGrow() {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await api.createGrow({ displayName: "New Grow" });
      onNewGrow(id);
    } catch { /* user can retry */ }
    finally { setCreating(false); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 16px 14px",
        paddingTop: "calc(18px + env(safe-area-inset-top, 0px))",
        paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
          My Grows
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={handleNewGrow}
          disabled={creating}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "9px 16px", borderRadius: 20,
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.3)",
            color: creating ? "var(--c-text-ghost)" : "var(--c-accent)",
            fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
            cursor: creating ? "default" : "pointer",
            opacity: creating ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {creating ? "…" : "+ New Grow"}
        </button>
      </div>

      {/* Cards */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 12,
        padding: "0 16px",
        paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      }}>
        {grows.map(grow => {
          const isActive = grow.id === activeGrowId;
          return (
            <div key={grow.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <GrowCard
                grow={grow}
                isActive={isActive}
                onActivate={setActiveGrowId}
              />
              {isActive && grow.config && onEditGrow && (
                <button
                  type="button"
                  className="touch-target"
                  onClick={() => onEditGrow(grow.id)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    padding: "11px 16px", borderRadius: 12,
                    background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                    color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
                    cursor: "pointer",
                  }}
                >
                  <SlidersHorizontal size={14} strokeWidth={1.8} />
                  Edit settings &amp; dates
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
