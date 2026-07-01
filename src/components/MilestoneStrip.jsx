import { sameDay, daysBetween, fmt } from "../lib/dates.js";

export default function MilestoneStrip({ today, milestones, onPick }) {
  return (
    <div style={{ overflowX: "auto", padding: "12px 16px 4px", WebkitOverflowScrolling: "touch" }}>
      <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
        {milestones.map(m => {
          const passed = daysBetween(m.date, today) < 0;
          const isToday = sameDay(m.date, today);
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => onPick(m.date)}
              style={{
                background: isToday ? `${m.color}22` : passed ? "rgba(255,255,255,0.03)" : "var(--c-surface-1)",
                border: isToday ? `1px solid ${m.color}` : "1px solid var(--c-border-faint)",
                borderRadius: 12, padding: "8px 13px", cursor: "pointer",
                opacity: passed ? 0.45 : 1,
                transition: "opacity 0.2s",
                font: "inherit", color: "inherit", textAlign: "center",
              }}>
              <div style={{ fontSize: 16 }}>{m.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--font-num)", color: isToday ? m.color : "var(--c-text-ghost)", marginTop: 4, whiteSpace: "nowrap" }}>
                {fmt(m.date)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--c-text-faint)", marginTop: 2, whiteSpace: "nowrap" }}>
                {m.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
