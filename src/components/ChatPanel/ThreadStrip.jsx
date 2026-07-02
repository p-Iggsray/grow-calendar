import { MONO } from "./constants.js";

// Horizontal scrollable thread pill strip - one pill per grow + "General".
export default function ThreadStrip({ grows, threadGrowId, activeGrowId, onSelect }) {
  const threads = [
    { id: null, label: "General" },
    ...grows.map(g => ({
      id: g.id,
      label: g.displayName?.slice(0, 16) || "Grow",
      isCalendarActive: g.id === activeGrowId,
    })),
  ];

  return (
    <div style={{
      display: "flex", gap: 6, overflowX: "auto", padding: "8px 14px",
      scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      borderBottom: "1px solid var(--c-border-faint)", flexShrink: 0,
    }}>
      {threads.map(t => {
        const isSelected = t.id === threadGrowId;
        return (
          <button
            key={t.id ?? "__general__"}
            type="button"
            className="touch-target"
            onClick={() => { if (!isSelected) onSelect(t.id); }}
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 20, minHeight: 34,
              background: isSelected ? "rgba(74,222,128,0.18)" : "var(--c-surface-1)",
              border: `1px solid ${isSelected ? "rgba(74,222,128,0.45)" : "var(--c-border)"}`,
              color: isSelected ? "var(--c-accent)" : "var(--c-text-muted)",
              fontFamily: MONO, fontSize: 11, letterSpacing: 0.8,
              cursor: isSelected ? "default" : "pointer",
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {t.isCalendarActive && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0 }} />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
