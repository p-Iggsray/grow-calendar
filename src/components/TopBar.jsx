import { CalendarDays, BookOpen } from "lucide-react";
import { phaseFamily } from "../lib/growData.js";
import { tapHaptic } from "../lib/haptics.js";

// Slim top bar for the main screen: the calendar is the feature, so identity
// shrinks to one line - grow name, today's phase, day-of-grow - plus the
// Calendar | Journal section toggle. Replaces the old hero header.

const VIEWS = [
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "journal",  label: "Journal",  Icon: BookOpen },
];

export default function TopBar({ growName, todayPhase, todayStyle, dayNum, view, onChangeView }) {
  const fam = todayPhase ? phaseFamily(todayPhase) : null;
  const accent = fam?.color || "var(--c-accent)";

  return (
    <div style={{
      paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(12px + env(safe-area-inset-right, 0px))",
      paddingBottom: 8,
      paddingLeft: "calc(12px + env(safe-area-inset-left, 0px))",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.2,
          color: "var(--c-text)", fontFamily: "var(--font-ui)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {growName || "Grow Calendar"}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5, marginTop: 1,
          fontFamily: "var(--font-ui)", fontSize: 10.5, color: "var(--c-text-muted)",
          overflow: "hidden", whiteSpace: "nowrap",
        }}>
          <span aria-hidden="true" style={{
            width: 6, height: 6, borderRadius: 3, flexShrink: 0,
            background: todayStyle ? accent : "var(--c-text-ghost)",
          }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {todayStyle?.label ?? "Off season"}
          </span>
          {dayNum != null && (
            <span style={{ fontFamily: "var(--font-num)", color: "var(--c-text-ghost)", flexShrink: 0 }}>
              · Day {dayNum}
            </span>
          )}
        </div>
      </div>

      {/* Section toggle: Calendar | Journal */}
      <div style={{
        display: "flex", gap: 3, padding: 3, borderRadius: 12, flexShrink: 0,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
      }}>
        {VIEWS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { if (!active) { tapHaptic(); onChangeView(id); } }}
              aria-pressed={active}
              aria-label={label}
              style={{
                padding: "7px 12px", borderRadius: 9, cursor: "pointer",
                background: active ? "var(--c-surface-2)" : "none",
                border: active ? "1px solid var(--c-border)" : "1px solid transparent",
                color: active ? "var(--c-text)" : "var(--c-text-muted)",
                fontFamily: "var(--font-ui)", fontSize: 11.5, fontWeight: active ? 700 : 500,
                display: "flex", alignItems: "center", gap: 6,
                transition: "background 0.15s, color 0.15s",
              }}>
              <Icon size={13} strokeWidth={2} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
