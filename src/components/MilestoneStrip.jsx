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
                background: isToday ? `${m.color}22` : passed ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
                border: isToday ? `1px solid ${m.color}` : passed ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                opacity: passed ? 0.45 : 1,
                transition: "opacity 0.2s",
              }}>
              <div style={{ fontSize: 16, textAlign: "center" }}>{m.icon}</div>
              <div style={{ fontSize: 10, fontFamily: "'Courier New', monospace", color: isToday ? m.color : "#aaa", marginTop: 4, whiteSpace: "nowrap" }}>
                {fmt(m.date)}
              </div>
              <div style={{ fontSize: 9, color: "#666", marginTop: 2, fontFamily: "'Courier New', monospace", whiteSpace: "nowrap" }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
