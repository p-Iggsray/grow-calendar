import { MONTH_NAMES, DOW_SHORT, sameDay } from "../lib/dates.js";
import { D, PHASES, getPhase, getThreatsForPhase } from "../lib/growData.js";

const YEAR = 2026;
const MIN_MONTH = 4;
const MAX_MONTH = 9;

export default function Calendar({ today, month, setMonth, selected, onPickDay, onClearSelection }) {
  const firstDow = new Date(YEAR, month, 1).getDay();
  const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(YEAR, month, d));

  const canPrev = month > MIN_MONTH;
  const canNext = month < MAX_MONTH;

  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
          <button
            onClick={() => { if (canPrev) { setMonth(m => m - 1); onClearSelection(); } }}
            style={{ background: "none", border: "none", color: canPrev ? "#4ade80" : "#2a4a2a", fontSize: 22, cursor: canPrev ? "pointer" : "default", padding: "0 8px", lineHeight: 1 }}>
            ‹
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "#e8f5e3" }}>
            {MONTH_NAMES[month]} {YEAR}
          </div>
          <button
            onClick={() => { if (canNext) { setMonth(m => m + 1); onClearSelection(); } }}
            style={{ background: "none", border: "none", color: canNext ? "#4ade80" : "#2a4a2a", fontSize: 22, cursor: canNext ? "pointer" : "default", padding: "0 8px", lineHeight: 1 }}>
            ›
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px" }}>
          {DOW_SHORT.map((l, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#3a5a3a", fontFamily: "'Courier New', monospace", fontWeight: 700, padding: "2px 0" }}>
              {l}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "6px 10px 12px" }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} style={{ minHeight: 40 }} />;
            const phase = getPhase(date);
            const pStyle = phase ? PHASES[phase] : null;
            const isSel = selected && sameDay(date, selected);
            const isToday = sameDay(date, today);
            const isKey = sameDay(date, D.transplant) || sameDay(date, D.gdpHarvest) || sameDay(date, D.hazeHarvest);
            const hasThreat = phase && getThreatsForPhase(phase).length > 0;

            return (
              <div
                key={date.getDate()}
                onClick={() => { if (pStyle) onPickDay(date); }}
                style={{
                  borderRadius: 8, minHeight: 40,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 2,
                  cursor: pStyle ? "pointer" : "default",
                  background: isSel
                    ? pStyle?.color
                    : isToday
                    ? `${pStyle?.color || "#4ade80"}22`
                    : pStyle
                    ? `${pStyle.color}18`
                    : "transparent",
                  border: isSel
                    ? `2px solid ${pStyle?.color}`
                    : isToday
                    ? `2px solid ${pStyle?.color || "#4ade80"}`
                    : isKey
                    ? `2px dashed ${pStyle?.color || "#aaa"}`
                    : "2px solid transparent",
                  position: "relative",
                  transition: "background 0.15s",
                  opacity: pStyle ? 1 : 0.2,
                }}>
                <span style={{
                  fontSize: 13, fontFamily: "'Courier New', monospace",
                  fontWeight: (isSel || isToday || isKey) ? 800 : 400,
                  color: isSel ? "white" : pStyle ? "#d4edd4" : "#444",
                }}>
                  {date.getDate()}
                </span>
                {pStyle && (
                  <div style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: isSel ? "rgba(255,255,255,0.6)" : pStyle.color,
                  }} />
                )}
                {hasThreat && !isSel && (
                  <div style={{
                    position: "absolute", top: 3, right: 4,
                    width: 5, height: 5, borderRadius: "50%",
                    background: "#f59e0b",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#3a5a3a", textAlign: "center", marginTop: 8, lineHeight: 1.8 }}>
        Solid border = today · Dashed = key date · Amber dot = active threats
      </div>
    </div>
  );
}
