import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES, DOW_SHORT, sameDay } from "../lib/dates.js";
import { PHASES, getPhase, phaseFamily } from "../lib/growData.js";
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
  today, month, setMonth, selected, config,
  loggedDays, onPickDay, onClearSelection,
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
        className="card"
        style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canPrev}
            aria-label="Previous month"
            style={{
              background: "none", border: "none",
              color: canPrev ? "var(--c-accent)" : "var(--c-text-ghost)",
              cursor: canPrev ? "pointer" : "default",
              minWidth: 44, minHeight: 44, padding: "8px 12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronLeft size={22} strokeWidth={canPrev ? 2 : 1.5} />
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "var(--c-text)" }}>
            {MONTH_NAMES[month]} {YEAR}
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={!canNext}
            aria-label="Next month"
            style={{
              background: "none", border: "none",
              color: canNext ? "var(--c-accent)" : "var(--c-text-ghost)",
              cursor: canNext ? "pointer" : "default",
              minWidth: 44, minHeight: 44, padding: "8px 12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <ChevronRight size={22} strokeWidth={canNext ? 2 : 1.5} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px" }}>
          {DOW_SHORT.map((l, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--c-text-ghost)", fontFamily: "var(--font-ui)", fontWeight: 700, padding: "2px 0" }}>
              {l}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "6px 10px 12px" }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} style={{ minHeight: 40 }} />;
            const phase = getPhase(date, config);
            const pStyle = phase ? PHASES[phase] : null;
            // One consolidated color per phase family keeps the calendar from
            // turning into a 13-color quilt.
            const famColor = phase ? phaseFamily(phase)?.color : null;
            const isSel = selected && sameDay(date, selected);
            const isToday = sameDay(date, today);
            const isKey = sameDay(date, config.transplant) || sameDay(date, config.backyardMove) || sameDay(date, config.gdpHarvest) || sameDay(date, config.hazeHarvest);

            // Completion ring tracks the daily LOG, not tasks: a filled-out log
            // gets a full green ring, an unlogged day gets none. Tasks are
            // guidance and never gate the ring.
            const isLogged = Boolean(pStyle && loggedDays?.[ymdKey(date)]);

            const ariaParts = [
              `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
              pStyle ? `${pStyle.label} phase` : "outside grow season",
              isToday ? "today" : null,
              isKey ? "key milestone" : null,
              isLogged ? "day logged" : null,
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
                className={isToday && !isSel ? "cell-today day-cell touch-target" : "day-cell touch-target"}
                style={{
                  font: "inherit",
                  borderRadius: 8, minHeight: 40,
                  padding: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 2,
                  cursor: pStyle ? "pointer" : "default",
                  background: isSel
                    ? famColor
                    : isToday
                    ? `${famColor || "var(--c-accent)"}22`
                    : pStyle
                    ? `${famColor}18`
                    : "transparent",
                  border: isSel
                    ? `2px solid ${famColor}`
                    : isToday
                    ? `2px solid ${famColor || "var(--c-accent)"}`
                    : isKey
                    ? `2px dashed ${famColor || "#aaa"}`
                    : "2px solid transparent",
                  position: "relative",
                  transition: "background 0.15s",
                  opacity: pStyle ? 1 : 0.2,
                }}>
                <span style={{
                  fontSize: 13, fontFamily: "var(--font-num)",
                  fontWeight: (isSel || isToday || isKey) ? 800 : 400,
                  color: isSel ? "white" : pStyle ? "var(--c-text-dim)" : "var(--c-text-ghost)",
                  lineHeight: 1,
                }} aria-hidden="true">
                  {date.getDate()}
                </span>
                {isLogged && !isSel && (
                  <CompletionRing ratio={1} complete />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--c-text-ghost)", textAlign: "center", marginTop: 8, lineHeight: 1.8 }}>
        Solid border = today · Dashed = key date · Green ring = day logged
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
