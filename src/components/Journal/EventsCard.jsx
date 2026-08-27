import { useEffect, useState } from "react";
import { CalendarDays, Plus, Clock } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { sameDay } from "../../lib/dates.js";
import { buildMilestones } from "../../lib/growData.js";
import { tapHaptic } from "../../lib/haptics.js";

const UI = "var(--font-ui)";
const EVENT_COLOR = "#38bdf8";

// 24h "HH:MM" -> "h:MM AM/PM" for display.
export function fmtTime(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || "");
  if (!m) return "";
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${ampm}`;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9,
  background: "rgba(0,0,0,0.2)", border: "1px solid var(--c-border-strong)",
  color: "var(--c-text)", fontFamily: UI, fontSize: 14.5, outline: "none",
};

function EventForm({ initial, onSave, onDelete, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const t = title.trim();
    if (!t) { setError("Give the event a name."); return; }
    setBusy(true);
    setError("");
    try {
      await onSave({ title: t, time: time || null, notes: notes.trim() || null });
    } catch (err) {
      setError(err?.message || "Could not save. Try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{
      padding: "11px 12px", borderRadius: 11, marginTop: 9,
      background: "var(--c-surface-2)", border: `1px solid ${EVENT_COLOR}44`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="Event name (Feed day, Flip to 12/12…)"
        maxLength={80}
        autoFocus={!initial}
        style={inputStyle}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="time"
          value={time ?? ""}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time (optional)"
          style={{ ...inputStyle, width: 130, flexShrink: 0 }}
        />
        <input
          type="text"
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (optional)"
          maxLength={300}
          style={inputStyle}
        />
      </div>
      {error && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)" }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {onDelete && (
          <button
            type="button"
            onClick={() => { if (!busy) onDelete(); }}
            style={{
              marginRight: "auto", padding: "8px 12px", borderRadius: 9,
              background: "none", border: "1px solid rgba(248,113,113,0.4)",
              color: "var(--c-danger-soft)", fontFamily: UI, fontSize: 12, cursor: "pointer",
            }}>
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "8px 12px", borderRadius: 9, background: "none",
            border: "1px solid var(--c-border-strong)", color: "var(--c-text-dim)",
            fontFamily: UI, fontSize: 12, cursor: "pointer",
          }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            padding: "8px 16px", borderRadius: 9,
            background: `${EVENT_COLOR}26`, border: `1px solid ${EVENT_COLOR}66`,
            color: EVENT_COLOR, fontFamily: UI, fontSize: 12, fontWeight: 700,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// The day's events: grow milestones appear as built-in (read-only) entries,
// user events can be added, edited, and deleted right here. Mutations
// broadcast journal-mutated so the calendar grid and month index refresh.
export default function EventsCard({ date, growId, events = [], config }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  useEffect(() => { setAdding(false); setEditingId(null); }, [date, growId]);

  const milestones = config
    ? buildMilestones(config).filter(m => m.date && sameDay(m.date, date))
    : [];

  const mutated = () => window.dispatchEvent(new CustomEvent("journal-mutated"));

  async function createEvent(fields) {
    await api.createGrowEvent(growId, { ...fields, date: ymd(date) });
    tapHaptic();
    setAdding(false);
    mutated();
  }
  async function saveEvent(id, fields) {
    await api.patchGrowEvent(growId, id, fields);
    tapHaptic();
    setEditingId(null);
    mutated();
  }
  async function deleteEvent(id) {
    try {
      await api.deleteGrowEvent(growId, id);
      tapHaptic();
      setEditingId(null);
      mutated();
    } catch { /* row stays; user can retry */ }
  }

  const empty = milestones.length === 0 && events.length === 0;

  return (
    <div className="card" style={{ padding: "14px 14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: empty && !adding ? 0 : 8 }}>
        <CalendarDays size={13} strokeWidth={2} style={{ color: EVENT_COLOR }} />
        <span style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-muted)", flex: 1,
        }}>
          Events
        </span>
        {!adding && (
          <button
            type="button"
            onClick={() => { tapHaptic(); setEditingId(null); setAdding(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "none", border: "1px solid var(--c-border-strong)",
              borderRadius: 12, padding: "5px 11px", cursor: "pointer",
              color: "var(--c-text-dim)", fontFamily: UI, fontSize: 11, fontWeight: 600,
            }}>
            <Plus size={12} strokeWidth={2.2} />
            Add
          </button>
        )}
      </div>

      {/* Built-in grow milestones for this day */}
      {milestones.map((m) => (
        <div key={m.label} style={{
          display: "flex", alignItems: "center", gap: 9, padding: "8px 0",
          borderTop: "1px solid var(--c-border-faint)",
        }}>
          <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>{m.icon}</span>
          <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 650, color: "var(--c-text)", flex: 1 }}>
            {m.label}
          </span>
          <span style={{
            fontFamily: UI, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase",
            color: "var(--c-text-ghost)", flexShrink: 0,
          }}>
            Milestone
          </span>
        </div>
      ))}

      {/* User events */}
      {events.map((ev) => (
        editingId === ev.id ? (
          <EventForm
            key={ev.id}
            initial={ev}
            onSave={(fields) => saveEvent(ev.id, fields)}
            onDelete={() => deleteEvent(ev.id)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <button
            key={ev.id}
            type="button"
            onClick={() => { tapHaptic(); setAdding(false); setEditingId(ev.id); }}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "8px 0",
              borderTop: "1px solid var(--c-border-faint)", borderBottom: "none",
              borderLeft: "none", borderRight: "none",
              width: "100%", background: "none", cursor: "pointer", textAlign: "left",
            }}>
            <span aria-hidden="true" style={{
              width: 7, height: 7, borderRadius: 4, background: EVENT_COLOR, flexShrink: 0,
            }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 650, color: "var(--c-text)", display: "block" }}>
                {ev.title}
              </span>
              {ev.notes && (
                <span style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-dim)", display: "block", marginTop: 1, lineHeight: 1.5 }}>
                  {ev.notes}
                </span>
              )}
            </span>
            {ev.time && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
                fontFamily: "var(--font-num)", fontSize: 11.5, color: "var(--c-text-dim)",
              }}>
                <Clock size={11} strokeWidth={2} style={{ color: "var(--c-text-ghost)" }} />
                {fmtTime(ev.time)}
              </span>
            )}
          </button>
        )
      ))}

      {adding && (
        <EventForm onSave={createEvent} onCancel={() => setAdding(false)} />
      )}

      {empty && !adding && null}
    </div>
  );
}
