import { useCallback, useEffect, useState } from "react";
import { AlarmClock, ChevronRight } from "lucide-react";
import { api, ymd } from "../lib/api.js";
import { tapHaptic } from "../lib/haptics.js";
import { fmtTime } from "./Journal/RemindersCard.jsx";

const UI = "var(--font-ui)";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Pure: how to name a day you are being reminded about. The next two days get
 * words because that is how people think about them; anything further gets a
 * date, because "in 9 days" makes you do arithmetic.
 */
export function relativeDayLabel(dateKey, todayKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-").map(Number);
  const [ty, tm, td] = String(todayKey).split("-").map(Number);
  if (!y || !ty) return dateKey;
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  const dt = new Date(y, m - 1, d);
  return days > 0 && days < 7 ? DOW[dt.getDay()] : `${MON[m - 1]} ${d}`;
}

// The next thing you asked to be reminded about, on the screen you actually
// look at. A reminder buried on its own day is not a reminder, so the soonest
// one sits above the month and taps straight through to it.
export default function UpcomingReminder({ growId, today, onOpenDay }) {
  const [events, setEvents] = useState([]);
  const todayKey = ymd(today ?? new Date());

  const load = useCallback(() => {
    if (!growId) { setEvents([]); return; }
    let cancelled = false;
    api.listGrowEvents(growId, { from: todayKey, limit: 5 })
      .then((d) => { if (!cancelled) setEvents(d.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [growId, todayKey]);

  useEffect(() => load(), [load]);
  // Setting or deleting one anywhere refreshes this.
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("journal-mutated", onChange);
    window.addEventListener("growlog-mutated", onChange);
    return () => {
      window.removeEventListener("journal-mutated", onChange);
      window.removeEventListener("growlog-mutated", onChange);
    };
  }, [load]);

  if (events.length === 0) return null;
  const next = events[0];
  const more = events.length - 1;
  const when = relativeDayLabel(next.date, todayKey);
  const at = fmtTime(next.time);

  return (
    <button
      type="button"
      onClick={() => {
        tapHaptic();
        const [y, m, d] = next.date.split("-").map(Number);
        onOpenDay?.(new Date(y, m - 1, d));
      }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "calc(100% - 20px)", margin: "8px 10px 0",
        padding: "10px 12px", borderRadius: 12,
        background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.32)",
        cursor: "pointer", textAlign: "left", font: "inherit",
      }}>
      <AlarmClock size={15} strokeWidth={2} style={{ color: "#a855f7", flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: "block", fontFamily: UI, fontSize: 13, fontWeight: 650,
          color: "var(--c-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {when}{at ? ` · ${at}` : ""} · {next.title}
        </span>
        {more > 0 && (
          <span style={{ display: "block", fontFamily: UI, fontSize: 11, color: "var(--c-text-faint)", marginTop: 1 }}>
            {more} more coming up
          </span>
        )}
      </span>
      <ChevronRight size={15} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
    </button>
  );
}
