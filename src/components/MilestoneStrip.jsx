import { sameDay, daysBetween, fmt } from "../lib/dates.js";

export default function MilestoneStrip({ today, milestones, onPick }) {
  return (
    <div style={{ overflowX: "auto", padding: "12px 16px 4px" }}>
      <div style={{ display: "flex", gap: 8, minWidth: "max-content" }}>
        {milestones.map(m => {
          const passed = daysBetween(m.date, today) < 0;
          const isToday = sameDay(m.date, today);
          return (
            <div
              key={m.label}
              onClick={() => onPick(m.date)}
              style={{
                background: isToday ? `${m.color}22` : passed ? "rgba(255,255,255,0.03)" : "var(--c-border-faint)",
                border: isToday ? `1px solid ${m.color}` : passed ? "1px solid var(--c-border-faint)" : "1px solid var(--c-border)",
                borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                opacity: passed ? 0.45 : 1,
                transition: "opacity 0.2s",
              }}>
              <div style={{ fontSize: 16, textAlign: "center" }}>{m.icon}</div>
              <div style={{ fontSize: 10, fontFamily: "'Courier New', monospace", color: isToday ? m.color : "var(--c-text-ghost)", marginTop: 4, whiteSpace: "nowrap" }}>
                {fmt(m.date)}
              </div>
              <div style={{ fontSize: 9, color: "var(--c-text-faint)", marginTop: 2, fontFamily: "'Courier New', monospace", whiteSpace: "nowrap" }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
