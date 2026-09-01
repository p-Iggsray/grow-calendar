import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { MONTH_NAMES, DOW_SHORT, sameDay, daysBetween } from "../lib/dates.js";
import { stageGroup, stageLabel, stageOnDate } from "../lib/stageTimeline.js";
import { tapHaptic } from "../lib/haptics.js";

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

function MonthArrow({ onClick, label, children }) {
  return (
    <button
      type="button"
      className="touch-target"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 40, height: 40, borderRadius: 20, flexShrink: 0,
        background: "var(--c-surface-2)",
        border: "1px solid var(--c-border-strong)",
        color: "var(--c-accent)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      {children}
    </button>
  );
}

// The app's main feature: a full-screen month, every day tappable straight
// into its journal page.
//
// Colour comes from what actually happened: the grow is tinted from the day
// you moved a plant into each stage onward, and the switch days themselves are
// marked. Nothing here is predicted.
export default function Calendar({
  today, year, month, onChangeMonth, stageEvents = [], firstDate = null,
  journalDays, onPickDay,
}) {
  const touchStart = useRef(null);
  const suppressTap = useRef(false);
  const [dir, setDir] = useState(0); // -1 prev, 1 next: drives the grid slide

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = cells.length / 7;

  const onCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // The days a stage actually changed, so those get a marker.
  const switchByDay = Object.fromEntries((stageEvents ?? []).map((e) => [e.date, e.stage]));

  function go(delta) {
    tapHaptic();
    setDir(delta);
    const next = new Date(year, month + delta, 1);
    onChangeMonth(next.getFullYear(), next.getMonth());
  }
  function jumpToToday() {
    tapHaptic();
    setDir(0);
    onChangeMonth(today.getFullYear(), today.getMonth());
  }

  function onTouchStart(e) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return;
    // Day buttons tile the whole grid, so month swipes necessarily start on
    // them. Swallow the click the browser fires after this touch so a swipe
    // never also opens a day.
    suppressTap.current = true;
    if (dx < 0) go(1); else go(-1);
  }
  function onClickCapture(e) {
    if (!suppressTap.current) return;
    suppressTap.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClickCapture={onClickCapture}
      style={{
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
        padding: "6px 10px 4px",
      }}>

      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 4px 8px" }}>
        <MonthArrow onClick={() => go(-1)} label="Previous month">
          <ChevronLeft size={20} strokeWidth={2.2} />
        </MonthArrow>
        <button
          type="button"
          onClick={onCurrentMonth ? undefined : jumpToToday}
          style={{
            background: "none", border: "none", cursor: onCurrentMonth ? "default" : "pointer",
            textAlign: "center", padding: 0, minWidth: 0, color: "var(--c-text)",
          }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: "var(--font-ui)" }}>
            {MONTH_NAMES[month]}
            <span style={{ fontWeight: 500, color: "var(--c-text-muted)", marginLeft: 7, fontFamily: "var(--font-num)", fontSize: 15 }}>
              {year}
            </span>
          </div>
          {!onCurrentMonth && (
            <div style={{
              marginTop: 2, fontFamily: "var(--font-ui)", fontSize: 10.5, fontWeight: 700,
              letterSpacing: 0.6, color: "var(--c-accent)",
            }}>
              Back to today
            </div>
          )}
        </button>
        <MonthArrow onClick={() => go(1)} label="Next month">
          <ChevronRight size={20} strokeWidth={2.2} />
        </MonthArrow>
      </div>

      {/* Weekday header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "0 0 4px" }}>
        {DOW_SHORT.map((l, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: "var(--c-text-ghost)", fontFamily: "var(--font-ui)", fontWeight: 700 }}>
            {l}
          </div>
        ))}
      </div>

      {/* The month grid fills all remaining height - the calendar IS the page. */}
      <motion.div
        key={`${year}-${month}`}
        initial={dir === 0 ? false : { x: dir > 0 ? 40 : -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        style={{
          flex: 1, minHeight: 300,
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gridTemplateRows: `repeat(${weeks}, minmax(52px, 1fr))`,
          gap: 3,
        }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const key = ymdKey(date);
          // The stage the grow was in on this day, read from real switches.
          const stage = firstDate && key >= firstDate ? stageOnDate(stageEvents, key) : null;
          const group = stage ? stageGroup(stage) : null;
          const famColor = group?.color ?? null;
          const pStyle = group ? { label: stageLabel(stage) } : null;
          const isToday = sameDay(date, today);
          const switchedTo = switchByDay[key] ?? null;

          // A grow day that has ended is "done": muted fill, tiny check.
          const isPast = Boolean(pStyle) && !isToday && daysBetween(today, date) > 0;
          // A written journal entry earns its own quiet accent dot.
          const hasEntry = Boolean(journalDays?.[key]?.note);
          // A day you asked to be reminded about gets its own mark, so a
          // reminder is visible from the month without opening the day.
          const hasReminder = Number(journalDays?.[key]?.events) > 0;

          const ariaParts = [
            `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
            pStyle ? `${pStyle.label} stage` : null,
            isToday ? "today" : null,
            isPast ? "day complete" : null,
            switchedTo ? `moved to ${stageLabel(switchedTo)}` : null,
            hasReminder ? "has a reminder" : null,
            hasEntry ? "journal entry written" : null,
            "opens this day's journal",
          ].filter(Boolean);

          return (
            <button
              type="button"
              key={key}
              onClick={() => { tapHaptic(); onPickDay(date); }}
              aria-label={ariaParts.join(", ")}
              aria-current={isToday ? "date" : undefined}
              className={isToday ? "cell-today day-cell" : "day-cell"}
              style={{
                font: "inherit",
                borderRadius: 10,
                padding: "3px 2px 2px",
                minWidth: 0,
                display: "flex", flexDirection: "column",
                alignItems: "stretch",
                gap: 2,
                cursor: "pointer",
                // famColor + alpha only works on a hex value; an off-season
                // today needs a real rgba, not "var(--c-accent)22".
                background: isToday
                  ? (famColor ? `${famColor}22` : "rgba(34,197,94,0.13)")
                  : isPast
                  ? `${famColor}0d`
                  : pStyle
                  ? `${famColor}18`
                  : "transparent",
                border: isToday
                  ? `2px solid ${famColor || "var(--c-accent)"}`
                  : switchedTo
                  ? `2px dashed ${famColor || "var(--c-text-muted)"}`
                  : "2px solid transparent",
                position: "relative",
                transition: "background 0.15s",
              }}>
              <span style={{
                fontSize: 13, fontFamily: "var(--font-num)",
                fontWeight: (isToday || switchedTo) ? 800 : 400,
                color: isToday
                  ? "var(--c-text)"
                  : isPast
                  ? "var(--c-text-muted)"
                  : pStyle
                  ? "var(--c-text-dim)"
                  : "var(--c-text-ghost)",
                lineHeight: 1.2, textAlign: "center",
              }} aria-hidden="true">
                {date.getDate()}
              </span>

              {/* The day a stage actually changed */}
              {switchedTo && (
                <span aria-hidden="true" style={{
                  display: "block", margin: "1px auto 0", width: 5, height: 5, borderRadius: 3,
                  background: famColor ?? "var(--c-text-muted)",
                }} />
              )}

              {isPast && (
                <Check
                  aria-hidden="true"
                  size={9}
                  strokeWidth={3}
                  style={{ position: "absolute", bottom: 2, right: 3, color: famColor, opacity: 0.85 }}
                />
              )}
              {hasEntry && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute", top: 3, right: 3,
                    width: 5, height: 5, borderRadius: 3,
                    background: "var(--c-accent)",
                  }}
                />
              )}
              {hasReminder && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute", top: 3, left: 3,
                    width: 5, height: 5, borderRadius: 3,
                    background: "#a855f7",
                  }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Legend with real swatches instead of a prose sentence */}
      <div
        aria-hidden="true"
        style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 12, flexWrap: "wrap", padding: "7px 0 4px",
          fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--c-text-ghost)",
        }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 4, border: "2px solid var(--c-accent)", flexShrink: 0 }} />
          Today
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 4, border: "2px dashed var(--c-text-muted)", flexShrink: 0 }} />
          Stage change
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 10, height: 10, borderRadius: 4, flexShrink: 0,
            background: "var(--c-surface-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <Check size={7} strokeWidth={3.5} style={{ color: "var(--c-text-muted)" }} />
          </span>
          Done
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--c-accent)", flexShrink: 0 }} />
          Journaled
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: "#a855f7", flexShrink: 0 }} />
          Reminder
        </span>
      </div>
    </div>
  );
}
