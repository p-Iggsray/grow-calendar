import { useEffect, useRef, useState } from "react";
import { AlarmClock, Clock, Plus, Trash2, X } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { tapHaptic } from "../../lib/haptics.js";

const UI = "var(--font-ui)";

// "2:30 PM" from "14:30". An untimed reminder just belongs to the day.
export function fmtTime(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${suffix}`;
}

// Reminders for one day, at the top of the day's page because that is the
// point of them: open the day, see what you meant to do.
//
// Deliberately one line of chrome. You type what you want to remember and
// press Add - no list to pick from, no note field, and a time only if you
// bother to ask for one. A past day only shows the card when it already has
// reminders, because there is nothing to remind you about yesterday.
export default function RemindersCard({ date, growId, events = [], today }) {
  const dateKey = ymd(date);
  const isPast = today ? dateKey < ymd(today) : false;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [showTime, setShowTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // A different day is a different set; never carry a half-typed one across.
  useEffect(() => {
    setOpen(false); setTitle(""); setTime(""); setShowTime(false); setError("");
  }, [dateKey, growId]);

  if (isPast && events.length === 0) return null;

  async function save() {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.createGrowEvent(growId, {
        date: dateKey,
        title: clean,
        ...(time ? { time } : {}),
      });
      tapHaptic();
      setTitle(""); setTime(""); setShowTime(false);
      // Stay open so a second reminder is just more typing.
      inputRef.current?.focus();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
    } catch (err) {
      setError(err?.message || "Could not save that reminder.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api.deleteGrowEvent(growId, id);
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
    } catch { /* the day refetches on the next change */ }
  }

  const canAdd = !isPast;

  return (
    <div className="card" style={{ padding: events.length ? "12px 14px 13px" : "8px 10px" }}>
      {events.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
            <AlarmClock size={13} strokeWidth={2} style={{ color: "#a855f7", flexShrink: 0 }} />
            <span style={{
              fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
              color: "var(--c-text-muted)",
            }}>
              Reminders
            </span>
          </div>
          {events.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--c-border-faint)",
              }}>
              <span style={{
                flex: 1, minWidth: 0, fontFamily: UI, fontSize: 14, fontWeight: 600,
                color: "var(--c-text)", lineHeight: 1.4,
              }}>
                {e.title}
                {e.time && (
                  <span style={{ fontWeight: 500, color: "var(--c-text-faint)", marginLeft: 7, fontSize: 12.5 }}>
                    {fmtTime(e.time)}
                  </span>
                )}
              </span>
              <button
                type="button"
                className="touch-target"
                onClick={() => remove(e.id)}
                aria-label={`Delete reminder: ${e.title}`}
                style={{
                  background: "none", border: "none", padding: 0, flexShrink: 0,
                  color: "var(--c-text-ghost)", cursor: "pointer", display: "flex",
                }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </>
      )}

      {canAdd && !open && (
        <button
          type="button"
          className="touch-target"
          onClick={() => { tapHaptic(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          style={{
            display: "flex", alignItems: "center", gap: 7, width: "100%",
            marginTop: events.length ? 8 : 0, padding: "6px 4px",
            background: "none", border: "none", cursor: "pointer",
            fontFamily: UI, fontSize: 13, fontWeight: 600, color: "var(--c-text-faint)",
            textAlign: "left",
          }}>
          <Plus size={14} strokeWidth={2.2} style={{ color: "#a855f7", flexShrink: 0 }} />
          {events.length ? "Add another" : "Remind me on this day"}
        </button>
      )}

      {canAdd && open && (
        <div style={{ marginTop: events.length ? 10 : 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={title}
              maxLength={80}
              placeholder="Remind me to…"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); save(); }
                if (e.key === "Escape") { setOpen(false); setTitle(""); }
              }}
              style={{
                flex: 1, minWidth: 0, boxSizing: "border-box",
                background: "var(--c-surface-1)", color: "var(--c-text)",
                border: "1px solid var(--c-border-strong)", borderRadius: 10,
                padding: "10px 12px", fontSize: 16, fontFamily: UI, outline: "none",
              }}
            />
            <button
              type="button"
              className="touch-target"
              onClick={save}
              disabled={busy || !title.trim()}
              style={{
                flexShrink: 0, padding: "0 16px", borderRadius: 10,
                background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.45)",
                color: "#a855f7", fontFamily: UI, fontSize: 13, fontWeight: 700,
                cursor: busy || !title.trim() ? "default" : "pointer",
                opacity: busy || !title.trim() ? 0.45 : 1,
              }}>
              {busy ? "…" : "Add"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            {showTime ? (
              <>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Time"
                  style={{
                    flexShrink: 0, boxSizing: "border-box",
                    background: "var(--c-surface-1)", color: "var(--c-text)",
                    border: "1px solid var(--c-border-strong)", borderRadius: 9,
                    padding: "7px 10px", fontSize: 15, fontFamily: UI, outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => { setShowTime(false); setTime(""); }}
                  aria-label="Remove the time"
                  style={{
                    background: "none", border: "none", padding: 4, cursor: "pointer",
                    color: "var(--c-text-ghost)", display: "flex", flexShrink: 0,
                  }}>
                  <X size={14} strokeWidth={2.2} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowTime(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "none", border: "none", padding: "2px 4px", cursor: "pointer",
                  fontFamily: UI, fontSize: 12, color: "var(--c-text-faint)",
                }}>
                <Clock size={12} strokeWidth={2} /> Add a time
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => { setOpen(false); setTitle(""); setTime(""); setShowTime(false); setError(""); }}
              style={{
                background: "none", border: "none", padding: "2px 4px", cursor: "pointer",
                fontFamily: UI, fontSize: 12, color: "var(--c-text-ghost)",
              }}>
              Done
            </button>
          </div>

          {error && (
            <div role="status" style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", marginTop: 6, lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
