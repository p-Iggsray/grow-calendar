import { CalendarDays, BookOpen } from "lucide-react";
import { tapHaptic } from "../../lib/haptics.js";

const OPTIONS = [
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "journal",  label: "Journal",  Icon: BookOpen },
];

// Segmented control that splits the main screen into its two sections.
export default function ViewSwitch({ view, onChange }) {
  return (
    <div style={{ padding: "10px 14px 2px" }}>
      <div style={{
        display: "flex", gap: 4, padding: 4, borderRadius: 13,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
      }}>
        {OPTIONS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { if (!active) { tapHaptic(); onChange(id); } }}
              aria-pressed={active}
              style={{
                flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                background: active ? "var(--c-surface-2)" : "none",
                border: active ? "1px solid var(--c-border)" : "1px solid transparent",
                color: active ? "var(--c-text)" : "var(--c-text-muted)",
                fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: active ? 700 : 500,
                letterSpacing: 0.3,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                transition: "background 0.15s, color 0.15s",
              }}>
              <Icon size={14} strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
