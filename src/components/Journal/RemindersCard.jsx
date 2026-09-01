import { useEffect, useState } from "react";
import { AlarmClock, Plus, Trash2, X } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { tapHaptic } from "../../lib/haptics.js";
import { REMINDER_TITLES } from "../../lib/choices.js";
import ChoiceField from "../ChoiceField.jsx";

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

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--c-surface-1)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 10,
  padding: "10px 12px", fontSize: 16, fontFamily: UI, outline: "none",
};

// Reminders for one day: what you meant to do, sitting on the day you meant to
// do it. Offered on today and any day ahead; a past day only shows them if it
// already has some, because there is nothing to remind you about yesterday.
export default function RemindersCard({ date, growId, events = [], today }) {
  const dateKey = ymd(date);
  const isPast = today ? dateKey < ymd(today) : false;

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A different day is a different set; never carry a half-typed one across.
  useEffect(() => { setAdding(false); setTitle(""); setTime(""); setNotes(""); setError(""); }, [dateKey, growId]);

  if (isPast && events.length === 0) return null;

  function reload() {
    window.dispatchEvent(new CustomEvent("journal-mutated"));
  }

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
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      tapHaptic();
      setAdding(false);
      setTitle(""); setTime(""); setNotes("");
      reload();
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
      reload();
    } catch { /* the list refetches on the next change */ }
  }

  return (
    <div className="card" style={{ padding: "14px 14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: events.length || adding ? 11 : 0 }}>
        <AlarmClock size={13} strokeWidth={2} style={{ color: "#a855f7" }} />
        <span style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-muted)", flex: 1,
        }}>
          Reminders
        </span>
        {events.length > 0 && (
          <span style={{ fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)" }}>{events.length}</span>
        )}
      </div>

      {events.map((e) => (
        <div
          key={e.id}
          style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0",
            borderTop: "1px solid var(--c-border-faint)",
          }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: UI, fontSize: 13.5, fontWeight: 650, color: "var(--c-text)" }}>
              {e.title}
            </span>
            {(e.time || e.notes) && (
              <span style={{ display: "block", fontFamily: UI, fontSize: 12, color: "var(--c-text-faint)", marginTop: 2, lineHeight: 1.5 }}>
                {[fmtTime(e.time), e.notes].filter(Boolean).join(" · ")}
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

      {adding ? (
        <div style={{ marginTop: events.length ? 12 : 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <ChoiceField
            value={title}
            onChange={setTitle}
            presets={REMINDER_TITLES}
            fieldKey="reminder-title"
            placeholder="What should you remember?"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: UI, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--c-text-muted)", marginBottom: 5 }}>
                Time (optional)
              </span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: UI, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--c-text-muted)", marginBottom: 5 }}>
                Note (optional)
              </span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything else"
                maxLength={300}
                style={inputStyle}
              />
            </label>
          </div>
          {error && (
            <div role="status" style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", lineHeight: 1.5 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="touch-target"
              onClick={() => { setAdding(false); setError(""); }}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 10,
                background: "none", border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-muted)", fontFamily: UI, fontSize: 12.5, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              <X size={13} strokeWidth={2} /> Cancel
            </button>
            <button
              type="button"
              className="touch-target"
              onClick={save}
              disabled={busy || !title.trim()}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 10,
                background: "rgba(168,85,247,0.14)", border: "1px solid rgba(168,85,247,0.45)",
                color: "#a855f7", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
                cursor: busy || !title.trim() ? "default" : "pointer",
                opacity: busy || !title.trim() ? 0.5 : 1,
              }}>
              {busy ? "Saving…" : "Set reminder"}
            </button>
          </div>
        </div>
      ) : !isPast && (
        <button
          type="button"
          className="touch-target"
          onClick={() => { tapHaptic(); setAdding(true); }}
          style={{
            width: "100%", marginTop: events.length ? 12 : 0,
            padding: "11px 12px", borderRadius: 11,
            background: "none", border: "1px dashed var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          <Plus size={14} strokeWidth={2.2} />
          {events.length ? "Add another reminder" : "Remind me on this day"}
        </button>
      )}
    </div>
  );
}
