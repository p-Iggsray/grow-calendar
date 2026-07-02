import { useState } from "react";
import { MoreVertical, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import DeleteGrowConfirm from "./DeleteGrowConfirm.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

const MONO  = "var(--font-ui)";
const SERIF = "var(--font-ui)";

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

function GrowCard({ grow, isActive, onActivate, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ss = !grow.config
    ? { label: "IN SETUP", color: "var(--c-warn)", bg: "rgba(251,191,36,0.10)" }
    : (STATUS_STYLE[grow.status] ?? STATUS_STYLE.active);
  const strains = grow.survey?.strains?.map(s => s.name).filter(Boolean) ?? [];
  const cfg     = grow.config;

  const transplantDate = cfg?.transplant  ? fmtDate(cfg.transplant)  : null;
  const harvestDate    = cfg?.hazeHarvest ? fmtDate(cfg.hazeHarvest)
                       : cfg?.gdpHarvest  ? fmtDate(cfg.gdpHarvest)  : null;

  const activate = () => { if (!isActive) onActivate(grow.id); };

  return (
    <div style={{ position: "relative" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !isActive) { e.preventDefault(); activate(); } }}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: 18, paddingRight: 52, borderRadius: 16,
          background: isActive ? "rgba(74,222,128,0.07)" : "var(--c-surface-1)",
          border: `1.5px solid ${isActive ? "rgba(74,222,128,0.4)" : "var(--c-border)"}`,
          cursor: isActive ? "default" : "pointer",
          transition: "border-color 0.2s, background 0.2s",
          opacity: grow.status === "abandoned" ? 0.65 : 1,
          boxSizing: "border-box",
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
      </div>

      {/* Kebab (⋮) menu trigger */}
      <button
        type="button"
        className="touch-target"
        aria-label="Grow options"
        onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
        style={{
          position: "absolute", top: 10, right: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 9,
          background: menuOpen ? "var(--c-surface-2)" : "transparent",
          border: "none", color: "var(--c-text-dim)", cursor: "pointer",
        }}
      >
        <MoreVertical size={18} strokeWidth={1.8} />
      </button>

      {/* Dropdown menu + click-away backdrop */}
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: "absolute", top: 44, right: 10, zIndex: 41,
            minWidth: 184, padding: 6, borderRadius: 12,
            background: "var(--c-panel-bg)", border: "1px solid var(--c-border-strong)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          }}>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onEdit(grow.id); }}
              style={menuItemStyle("var(--c-text-dim)")}
            >
              <SlidersHorizontal size={15} strokeWidth={1.8} />
              Grow settings
            </button>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onDelete(grow); }}
              style={menuItemStyle("var(--c-danger-soft)")}
            >
              <Trash2 size={15} strokeWidth={1.8} />
              Delete grow
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function menuItemStyle(color) {
  return {
    display: "flex", alignItems: "center", gap: 10,
    width: "100%", padding: "11px 12px", borderRadius: 8,
    background: "transparent", border: "none", cursor: "pointer",
    color, fontFamily: MONO, fontSize: 13, letterSpacing: 0.5, textAlign: "left",
  };
}

export default function GrowsListTab({ grows, activeGrowId, setActiveGrowId, onNewGrow, onEditGrow, onGrowDeleted }) {
  const [creating, setCreating] = useState(false);
  const [deletingGrow, setDeletingGrow] = useState(null);
  const [resumeGrow, setResumeGrow] = useState(null); // unfinished grow the user tapped

  // Tapping a grow that never finished setup can't activate it (there's no
  // calendar to show) - offer to resume the setup wizard instead of silently
  // bouncing the selection back.
  function handleActivate(id) {
    const grow = grows.find(g => g.id === id);
    if (grow && !grow.config) { setResumeGrow(grow); return; }
    setActiveGrowId(id);
  }

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
        {grows.map(grow => (
          <GrowCard
            key={grow.id}
            grow={grow}
            isActive={grow.id === activeGrowId}
            onActivate={handleActivate}
            onEdit={onEditGrow}
            onDelete={setDeletingGrow}
          />
        ))}
      </div>

      <ConfirmModal
        open={Boolean(resumeGrow)}
        title="Finish setting up this grow?"
        message={`"${resumeGrow?.displayName || "This grow"}" isn't finished setting up yet, so it doesn't have a calendar. Want to pick up where you left off?`}
        confirmLabel="Finish setup"
        cancelLabel="Not now"
        onConfirm={() => { const id = resumeGrow.id; setResumeGrow(null); onNewGrow(id); }}
        onCancel={() => setResumeGrow(null)}
      />

      {deletingGrow && (
        <DeleteGrowConfirm
          growId={deletingGrow.id}
          growName={deletingGrow.displayName}
          onClose={() => setDeletingGrow(null)}
          onDeleted={async () => { setDeletingGrow(null); await onGrowDeleted?.(); }}
        />
      )}
    </div>
  );
}
