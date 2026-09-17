import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES, DOW_SHORT, sameDay } from "../../lib/dates.js";
import { stageGroup, stageOnDate, STAGE_GLYPH } from "../../lib/stageTimeline.js";
import { openingMonth } from "../../lib/shareRoute.js";
import { UI, NUM, keyOf } from "./chrome.jsx";

// The month a grow starts in, so the arrows cannot walk off the front of the
// record into empty months nobody wrote in.
function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function hasAnything(entry) {
  if (!entry) return false;
  return Boolean(entry.log || entry.note || entry.plants > 0 || entry.photos > 0);
}

// Up to three marks under a date: something was written, something was logged,
// a picture was taken. Three small dots say what kind of day it was without
// opening it.
function DayMarks({ entry, color }) {
  if (!entry) return null;
  const marks = [
    entry.note ? { key: "note", fill: true } : null,
    entry.log || entry.plants > 0 ? { key: "log", fill: true } : null,
    entry.photos > 0 ? { key: "photo", fill: false } : null,
  ].filter(Boolean);
  if (!marks.length) return null;
  return (
    <span aria-hidden="true" style={{ display: "flex", gap: 2, height: 4, alignItems: "center" }}>
      {marks.map((m) => (
        <span key={m.key} style={{
          width: 3.5, height: 3.5, borderRadius: 4,
          background: m.fill ? (color || "var(--c-accent)") : "transparent",
          border: m.fill ? "none" : `1px solid ${color || "var(--c-accent)"}`,
        }} />
      ))}
    </span>
  );
}

/**
 * The shared calendar, and the thing the friend view was missing: every day
 * that holds something is a real button that opens it.
 *
 * A day with nothing in it is still rendered, still shows its stage colour,
 * and is still disabled, because a grid with holes in it is harder to read
 * than a grid with quiet days in it.
 */
export default function BuddyCalendar({
  today, month, onMonth, stageEvents, firstDate, days, loading, onOpenDay,
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDow = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));

  const atStart = firstDate ? monthKey(year, m) <= firstDate.slice(0, 7) : false;
  const atEnd = monthKey(year, m) >= monthKey(today.getFullYear(), today.getMonth());

  const step = (delta) => onMonth(new Date(year, m + delta, 1));

  return (
    <section
      aria-label="Calendar"
      style={{
        background: "var(--c-surface-1)", borderRadius: 14,
        border: "1px solid var(--c-border-soft)", overflow: "hidden",
      }}>
      <header style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 8px 6px" }}>
        <button
          type="button"
          className="touch-target"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label="Previous month"
          style={navBtn(atStart)}>
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <div style={{
          flex: 1, textAlign: "center", fontSize: 16, fontWeight: 800,
          letterSpacing: -0.4, color: "var(--c-text)", fontFamily: UI,
        }}>
          {MONTH_NAMES[m]} {year}
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label="Next month"
          style={navBtn(atEnd)}>
          <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px" }}>
        {DOW_SHORT.map((l, i) => (
          <div key={i} style={{
            textAlign: "center", fontSize: 11, color: "var(--c-text-ghost)",
            fontFamily: UI, fontWeight: 700, padding: "2px 0",
          }}>
            {l}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3,
          padding: "6px 10px 12px",
          opacity: loading ? 0.5 : 1, transition: "opacity 0.18s",
        }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} style={{ minHeight: 44 }} />;
          const key = keyOf(year, m, date.getDate());
          const stage = firstDate && key >= firstDate ? stageOnDate(stageEvents, key) : null;
          const color = stage ? stageGroup(stage)?.color : null;
          const isToday = sameDay(date, today);
          const entry = days?.[key];
          const open = hasAnything(entry);
          const glyph = stage ? (STAGE_GLYPH[stage] ?? "") : "";

          return (
            <button
              key={date.getDate()}
              type="button"
              className="day-cell"
              disabled={!open}
              onClick={() => onOpenDay(key)}
              aria-label={
                `${MONTH_NAMES[m]} ${date.getDate()}` +
                (open ? ", has entries" : ", nothing recorded")
              }
              style={{
                borderRadius: 8, minHeight: 44, padding: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                cursor: open ? "pointer" : "default",
                background: isToday
                  ? `${color || "var(--c-accent)"}22`
                  : color ? `${color}18` : "transparent",
                border: isToday
                  ? `2px solid ${color || "var(--c-accent)"}`
                  : open ? `1px solid ${color || "var(--c-accent)"}55`
                  : "2px solid transparent",
                // A day with nothing in it stays faint whether or not the grow
                // had reached it: there is nothing behind it to open.
                opacity: open ? 1 : color ? 0.45 : 0.2,
              }}>
              <span style={{ fontSize: 12.5, fontFamily: NUM, color: "var(--c-text-dim)", lineHeight: 1 }}>
                {date.getDate()}
              </span>
              {glyph && (
                <span style={{ fontSize: 10, fontFamily: NUM, fontWeight: 700, color, lineHeight: 1 }}>
                  {glyph}
                </span>
              )}
              <DayMarks entry={entry} color={color} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function navBtn(disabled) {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 34, height: 34, borderRadius: 9,
    background: "none", border: "1px solid var(--c-border-faint)",
    color: disabled ? "var(--c-text-ghost)" : "var(--c-text-dim)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.35 : 1, flexShrink: 0,
  };
}

// Keeps the month in step with what is being read: the open day if there is
// one, otherwise the last month this space has anything written in.
export function useMonthFor({ date, lastDate, today }) {
  const want = openingMonth({ date, lastDate, today });
  const [month, setMonth] = useState(() => new Date(want.year, want.month, 1));
  // A key rather than the object, so this only fires when the answer changes.
  const wantKey = `${want.year}-${want.month}`;
  const seen = useRef(wantKey);
  useEffect(() => {
    if (seen.current === wantKey) return;
    seen.current = wantKey;
    setMonth(new Date(want.year, want.month, 1));
  }, [wantKey, want.year, want.month]);
  return [month, setMonth];
}
