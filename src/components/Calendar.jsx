import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES, DOW_SHORT, sameDay } from "../lib/dates.js";
import { PHASES, getPhase, getDetail, getThreatsForPhase, phaseGlyph } from "../lib/growData.js";
import { GROW_MIN_MONTH, GROW_MAX_MONTH } from "../lib/appConfig.js";

const YEAR = 2026;
const MIN_MONTH = GROW_MIN_MONTH;
const MAX_MONTH = GROW_MAX_MONTH;
// Tuned for one-thumb phone use. Threshold below ~40px catches incidental drag
// during a tap; horizontal-vs-vertical ratio under ~1.5 catches diagonal
// scrolls. Bump if false-positives appear during vertical page scroll.
const SWIPE_THRESHOLD_PX = 50;
const SWIPE_HORIZONTAL_RATIO = 2;

function ymdKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Calendar({
  today, month, setMonth, selected, config, overrides,
  checkoffCounts, onPickDay, onClearSelection,
}) {
  const touchStart = useRef(null);
  const firstDow = new Date(YEAR, month, 1).getDay();
  const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(YEAR, month, d));

  const canPrev = month > MIN_MONTH;
  const canNext = month < MAX_MONTH;

  function goPrev() { if (canPrev) { setMonth(m => m - 1); onClearSelection(); } }
  function goNext() { if (canNext) { setMonth(m => m + 1); onClearSelection(); } }

  function onTouchStart(e) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    // Swipes that originate on a real interactive child (day button, nav
    // chevron) belong to that control - don't hijack them as month swipes.
    if (e.target?.closest?.("button")) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return;
    if (dx < 0) goNext(); else goPrev();
  }

  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Previous month"
            style={{
              background: "none", border: "none",
              color: canPrev ? "#4ade80" : "#2a4a2a",
              cursor: canPrev ? "pointer" : "default",
              minWidth: 44, minHeight: 44, padding: "8px 12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronLeft size={22} strokeWidth={canPrev ? 2 : 1.5} />
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "#e8f5e3" }}>
            {MONTH_NAMES[month]} {YEAR}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Next month"
            style={{
              background: "none", border: "none",
              color: canNext ? "#4ade80" : "#2a4a2a",
              cursor: canNext ? "pointer" : "default",
              minWidth: 44, minHeight: 44, padding: "8px 12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronRight size={22} strokeWidth={canNext ? 2 : 1.5} />
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
            const phase = getPhase(date, config);
            const pStyle = phase ? PHASES[phase] : null;
            const isSel = selected && sameDay(date, selected);
            const isToday = sameDay(date, today);
            const isKey = sameDay(date, config.transplant) || sameDay(date, config.backyardMove) || sameDay(date, config.gdpHarvest) || sameDay(date, config.hazeHarvest);
            const hasThreat = phase && getThreatsForPhase(phase).length > 0;

            const glyph = pStyle ? phaseGlyph(phase) : "";

            // Completion ring: ratio of checked / total tasks for this day.
            // Only render once the user has checked at least one task on this
            // day - avoids showing empty 0/N rings on every future cell.
            let ringRatio = 0;
            let totalTasks = 0;
            if (pStyle) {
              const dayDetail = getDetail(date, config, overrides);
              totalTasks = dayDetail?.tasks?.length ?? 0;
              const doneCount = checkoffCounts?.[ymdKey(date)] ?? 0;
              if (totalTasks > 0 && doneCount > 0) {
                ringRatio = Math.min(1, doneCount / totalTasks);
              }
            }

            const doneCount = checkoffCounts?.[ymdKey(date)] ?? 0;
            const ariaParts = [
              `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
              pStyle ? `${pStyle.label} phase` : "outside grow season",
              isToday ? "today" : null,
              isKey ? "key milestone" : null,
              hasThreat ? "has active threats" : null,
              totalTasks > 0 && doneCount > 0
                ? `${doneCount} of ${totalTasks} tasks done`
                : null,
              isSel ? "selected" : null,
            ].filter(Boolean);

            return (
              <button
                type="button"
                key={date.getDate()}
                onClick={() => { if (pStyle) onPickDay(date); }}
                disabled={!pStyle}
                aria-label={ariaParts.join(", ")}
                aria-pressed={isSel ? true : undefined}
                aria-current={isToday ? "date" : undefined}
                className={isToday && !isSel ? "cell-today day-cell" : "day-cell"}
                style={{
                  font: "inherit",
                  borderRadius: 8, minHeight: 40,
                  padding: 0,
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
                  lineHeight: 1,
                }} aria-hidden="true">
                  {date.getDate()}
                </span>
                {glyph && (
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 9, fontFamily: "'Courier New', monospace",
                      fontWeight: 700, letterSpacing: 0.5,
                      color: isSel ? "rgba(255,255,255,0.85)" : pStyle.color,
                      lineHeight: 1,
                    }}>
                    {glyph}
                  </span>
                )}
                {hasThreat && !isSel && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute", top: 3, right: 4,
                      width: 5, height: 5, borderRadius: "50%",
                      background: "#f59e0b",
                    }} />
                )}
                {ringRatio > 0 && !isSel && (
                  <CompletionRing ratio={ringRatio} complete={ringRatio >= 1} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#3a5a3a", textAlign: "center", marginTop: 8, lineHeight: 1.8 }}>
        Solid border = today · Dashed = key date · Amber dot = active threats · Green ring = day complete
      </div>
    </div>
  );
}

// SVG arc traces the completion ratio around a day cell. A full ratio (>=1)
// becomes a closed green ring; partial ratios are amber arcs so partially-done
// days don't read as "done."
function CompletionRing({ ratio, complete }) {
  const size = 30;        // outer box; cell minHeight is 40, this fits inside
  const stroke = 2;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = ratio * circumference;
  const color = complete ? "#22c55e" : "#f59e0b";
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: "absolute", inset: 0, margin: "auto",
        pointerEvents: "none",
      }}>
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        opacity={complete ? 0.85 : 0.7}
      />
    </svg>
  );
}
