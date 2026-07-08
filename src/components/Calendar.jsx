import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { MONTH_NAMES, DOW_SHORT, sameDay, daysBetween } from "../lib/dates.js";
import { PHASES, getPhase, phaseFamily } from "../lib/growData.js";
import { GROW_MIN_MONTH, GROW_MAX_MONTH } from "../lib/appConfig.js";
import { tapHaptic } from "../lib/haptics.js";

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

// Dedicated month-nav button: a real tappable circle, clearly disabled at the
// edges of the season instead of a bare ghost chevron.
function MonthArrow({ onClick, disabled, label, children }) {
  return (
    <button
      type="button"
      className="touch-target"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        width: 40, height: 40, borderRadius: 20, flexShrink: 0,
        background: disabled ? "transparent" : "var(--c-surface-2)",
        border: `1px solid ${disabled ? "var(--c-border-faint)" : "var(--c-border-strong)"}`,
        color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)",
        cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, color 0.15s",
      }}>
      {children}
    </button>
  );
}

export default function Calendar({
  today, month, setMonth, selected, config,
  loggedDays, journalDays, onPickDay, onClearSelection,
}) {
  const touchStart = useRef(null);
  const [dir, setDir] = useState(0); // -1 prev, 1 next: drives the grid slide
  const firstDow = new Date(YEAR, month, 1).getDay();
  const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(YEAR, month, d));

  const canPrev = month > MIN_MONTH;
  const canNext = month < MAX_MONTH;
  const todayMonth = today.getFullYear() === YEAR ? today.getMonth() : null;
  const offMonth = todayMonth !== null && month !== todayMonth;

  const seasonMonths = [];
  for (let m = MIN_MONTH; m <= MAX_MONTH; m++) seasonMonths.push(m);

  const loggedThisMonth = Object.keys(loggedDays ?? {})
    .filter(k => k.startsWith(`${YEAR}-${String(month + 1).padStart(2, "0")}-`)).length;

  function jumpTo(m) {
    if (m === month || m < MIN_MONTH || m > MAX_MONTH) return;
    tapHaptic();
    setDir(m > month ? 1 : -1);
    setMonth(m);
    onClearSelection();
  }
  function goPrev() { if (canPrev) jumpTo(month - 1); }
  function goNext() { if (canNext) jumpTo(month + 1); }

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

        {/* Header: dedicated arrow buttons flanking the month title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 12px 8px" }}>
          <MonthArrow onClick={goPrev} disabled={!canPrev} label="Previous month">
            <ChevronLeft size={20} strokeWidth={2.2} />
          </MonthArrow>
          <div style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "var(--c-text)", lineHeight: 1.2 }}>
              {MONTH_NAMES[month]}
              <span style={{ fontWeight: 500, color: "var(--c-text-muted)", marginLeft: 6, fontFamily: "var(--font-num)", fontSize: 14 }}>
                {YEAR}
              </span>
            </div>
            {offMonth ? (
              <button
                type="button"
                onClick={() => jumpTo(todayMonth)}
                style={{
                  marginTop: 3, padding: "3px 11px", borderRadius: 11,
                  background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)",
                  color: "var(--c-accent)", fontFamily: "var(--font-ui)", fontSize: 10.5,
                  fontWeight: 700, letterSpacing: 0.6, cursor: "pointer",
                }}>
                Back to today
              </button>
            ) : (
              <div style={{ marginTop: 3, fontFamily: "var(--font-ui)", fontSize: 10.5, color: "var(--c-text-ghost)", letterSpacing: 0.4 }}>
                {loggedThisMonth > 0
                  ? `${loggedThisMonth} ${loggedThisMonth === 1 ? "day" : "days"} logged this month`
                  : "Tap a day to open it"}
              </div>
            )}
          </div>
          <MonthArrow onClick={goNext} disabled={!canNext} label="Next month">
            <ChevronRight size={20} strokeWidth={2.2} />
          </MonthArrow>
        </div>

        {/* Season month jumper: one dedicated button per month of the grow */}
        <div style={{ display: "flex", justifyContent: "center", gap: 5, padding: "0 12px 10px" }}>
          {seasonMonths.map((m) => {
            const active = m === month;
            const isNow = m === todayMonth;
            return (
              <button
                key={m}
                type="button"
                onClick={() => jumpTo(m)}
                aria-label={`${MONTH_NAMES[m]}${isNow ? " (current month)" : ""}`}
                aria-pressed={active}
                style={{
                  minWidth: 34, padding: "4px 0 3px", borderRadius: 9,
                  background: active ? "rgba(34,197,94,0.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(34,197,94,0.45)" : "var(--c-border-faint)"}`,
                  color: active ? "var(--c-accent)" : "var(--c-text-muted)",
                  fontFamily: "var(--font-ui)", fontSize: 10.5, fontWeight: active ? 800 : 500,
                  letterSpacing: 0.8, cursor: "pointer", textTransform: "uppercase",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  transition: "background 0.15s, color 0.15s",
                }}>
                {MONTH_NAMES[m].slice(0, 3)}
                <span style={{
                  width: 4, height: 4, borderRadius: 2,
                  background: isNow ? "var(--c-accent)" : "transparent",
                }} />
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px", borderTop: "1px solid var(--c-border-faint)", paddingTop: 8 }}>
          {DOW_SHORT.map((l, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--c-text-ghost)", fontFamily: "var(--font-ui)", fontWeight: 700, padding: "2px 0" }}>
              {l}
            </div>
          ))}
        </div>

        {/* Day grid slides in from the direction of travel on month change */}
        <motion.div
          key={month}
          initial={dir === 0 ? false : { x: dir > 0 ? 40 : -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "6px 10px 12px" }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} style={{ minHeight: 42 }} />;
            const phase = getPhase(date, config);
            const pStyle = phase ? PHASES[phase] : null;
            // One consolidated color per phase family keeps the calendar from
            // turning into a 13-color quilt.
            const famColor = phase ? phaseFamily(phase)?.color : null;
            const isSel = selected && sameDay(date, selected);
            const isToday = sameDay(date, today);
            const isKey = sameDay(date, config.transplant) || sameDay(date, config.backyardMove) || sameDay(date, config.gdpHarvest) || sameDay(date, config.hazeHarvest);

            // A day that has ended is "done": its fill mutes and a tiny check
            // closes it out - automatic, nothing to tap. Distinct from
            // off-season days, which are faded and disabled entirely.
            const isPast = Boolean(pStyle) && !isToday && daysBetween(today, date) > 0;
            // A written journal entry earns its own quiet accent dot.
            const hasEntry = Boolean(pStyle && journalDays?.[ymdKey(date)]?.note);

            const ariaParts = [
              `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
              pStyle ? `${pStyle.label} phase` : "outside grow season",
              isToday ? "today" : null,
              isPast ? "day complete" : null,
              isKey ? "key milestone" : null,
              hasEntry ? "journal entry written" : null,
              isSel ? "selected" : null,
            ].filter(Boolean);

            return (
              <button
                type="button"
                key={date.getDate()}
                onClick={() => { if (pStyle) { tapHaptic(); onPickDay(date); } }}
                disabled={!pStyle}
                aria-label={ariaParts.join(", ")}
                aria-pressed={isSel ? true : undefined}
                aria-current={isToday ? "date" : undefined}
                className={isToday && !isSel ? "cell-today day-cell touch-target" : "day-cell touch-target"}
                style={{
                  font: "inherit",
                  borderRadius: 9, minHeight: 42,
                  padding: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 2,
                  cursor: pStyle ? "pointer" : "default",
                  background: isSel
                    ? famColor
                    : isToday
                    ? `${famColor || "var(--c-accent)"}22`
                    : isPast
                    ? `${famColor}0d`
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
                  color: isSel ? "white" : isPast ? "var(--c-text-muted)" : pStyle ? "var(--c-text-dim)" : "var(--c-text-ghost)",
                  lineHeight: 1,
                }} aria-hidden="true">
                  {date.getDate()}
                </span>
                {isPast && !isSel && (
                  <Check
                    aria-hidden="true"
                    size={9}
                    strokeWidth={3}
                    style={{ position: "absolute", bottom: 2, right: 3, color: famColor, opacity: 0.85 }}
                  />
                )}
                {hasEntry && !isSel && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute", top: 3, right: 3,
                      width: 5, height: 5, borderRadius: 3,
                      background: "var(--c-accent)",
                    }}
                  />
                )}
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* Legend with real swatches instead of a prose sentence */}
      <div
        aria-hidden="true"
        style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 14, flexWrap: "wrap", marginTop: 8,
          fontFamily: "var(--font-ui)", fontSize: 10.5, color: "var(--c-text-ghost)",
        }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: 4, border: "2px solid var(--c-accent)", flexShrink: 0 }} />
          Today
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: 4, border: "2px dashed var(--c-text-muted)", flexShrink: 0 }} />
          Key date
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{
            width: 11, height: 11, borderRadius: 4, flexShrink: 0,
            background: "var(--c-surface-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <Check size={8} strokeWidth={3.5} style={{ color: "var(--c-text-muted)" }} />
          </span>
          Day done
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--c-accent)", flexShrink: 0 }} />
          Journaled
        </span>
      </div>
    </div>
  );
}

