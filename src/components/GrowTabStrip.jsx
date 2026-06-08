import { Plus } from "lucide-react";

const MONO = "'Courier New', monospace";

function truncate(str, max = 14) {
  if (!str) return "Unnamed";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

export default function GrowTabStrip({ grows, selectedId, activeGrowId, onSelect, onNewGrow, creating }) {
  return (
    <div style={{
      paddingTop: "calc(env(safe-area-inset-top, 0px))",
      borderBottom: "1px solid var(--c-border)",
      background: "var(--c-bg)",
      position: "sticky",
      top: 0,
      zIndex: 10,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        padding: "10px 14px 0",
        paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      }}>
        {grows.map(grow => {
          const isSelected = grow.id === selectedId;
          const isCalendar = grow.id === activeGrowId;
          return (
            <button
              key={grow.id}
              type="button"
              onClick={() => onSelect(grow.id)}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                paddingBottom: 10,
                borderRadius: 0,
                border: "none",
                borderBottom: isSelected
                  ? "2px solid var(--c-accent)"
                  : "2px solid transparent",
                background: "none",
                cursor: "pointer",
                color: isSelected ? "var(--c-text)" : "var(--c-text-ghost)",
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 0.4,
                fontWeight: isSelected ? 700 : 400,
                transition: "color 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {truncate(grow.displayName)}
              {isCalendar && (
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--c-accent)",
                  flexShrink: 0,
                  display: "inline-block",
                }} />
              )}
            </button>
          );
        })}

        {/* New grow button */}
        <button
          type="button"
          onClick={onNewGrow}
          disabled={creating}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "7px 10px",
            paddingBottom: 10,
            border: "none",
            borderBottom: "2px solid transparent",
            background: "none",
            cursor: creating ? "default" : "pointer",
            color: creating ? "var(--c-text-ghost)" : "var(--c-text-faint)",
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: 0.4,
            opacity: creating ? 0.5 : 1,
          }}
        >
          <Plus size={12} strokeWidth={1.8} />
          {creating ? "…" : "New"}
        </button>
      </div>
    </div>
  );
}
