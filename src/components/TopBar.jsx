import { CalendarDays, BookOpen } from "lucide-react";
import { tapHaptic } from "../lib/haptics.js";
import ScreenHeader from "./ScreenHeader.jsx";

// The main screen's top strip. Same header every other window wears - it just
// has no back button, because the calendar is a root tab. The environment's
// name is the title, today's phase the eyebrow, and the Calendar | Journal
// switch sits in the right slot.

const VIEWS = [
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "journal",  label: "Journal",  Icon: BookOpen },
];

export default function TopBar({ growName, todayStyle, dayNum, view, onChangeView }) {
  const eyebrow = [
    todayStyle?.label ?? "Off season",
    dayNum != null ? `Day ${dayNum}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <ScreenHeader
      eyebrow={eyebrow}
      title={growName || "Grow Calendar"}
      right={(
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
                  padding: "7px 11px", borderRadius: 9, cursor: "pointer",
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
      )}
    />
  );
}
