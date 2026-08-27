import { useEffect, useState } from "react";
import { Flag, ChevronRight } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { sameDay } from "../../lib/dates.js";
import { buildMilestones } from "../../lib/growData.js";
import { tapHaptic } from "../../lib/haptics.js";

const UI = "var(--font-ui)";

// The grow's season milestones falling on this day - and the place to MOVE
// them. Tapping a milestone opens a date picker; saving rewrites that single
// config date (everything else stays put) and the calendar re-lays itself out.
export default function MilestonesCard({ date, growId, config, onConfigChanged }) {
  const [editingKey, setEditingKey] = useState(null);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setEditingKey(null); setError(""); }, [date, growId]);

  const milestones = config
    ? buildMilestones(config).filter(m => m.date && sameDay(m.date, date))
    : [];
  if (milestones.length === 0) return null;

  function startEdit(m) {
    tapHaptic();
    setError("");
    setNewDate(ymd(m.date));
    setEditingKey(m.key);
  }

  async function saveMove(m) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { setError("Pick a date."); return; }
    if (newDate === ymd(m.date)) { setEditingKey(null); return; }
    setBusy(true);
    setError("");
    try {
      // Full-replace the config with ONE date changed, reading the raw ISO
      // config from the server so nothing is lost in translation.
      const grow = await api.getGrow(growId);
      if (!grow?.config?.[m.key]) throw new Error("Could not load the season dates.");
      await api.patchGrow(growId, { config: { ...grow.config, [m.key]: newDate } });
      tapHaptic();
      setEditingKey(null);
      await onConfigChanged?.();
    } catch (err) {
      setError(err?.message || "Could not move the date. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: "14px 14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <Flag size={13} strokeWidth={2} style={{ color: "var(--c-warn)" }} />
        <span style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-muted)", flex: 1,
        }}>
          Milestones
        </span>
      </div>

      {milestones.map((m) => (
        <div key={m.key} style={{ borderTop: "1px solid var(--c-border-faint)" }}>
          <button
            type="button"
            onClick={() => (editingKey === m.key ? setEditingKey(null) : startEdit(m))}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "9px 0",
              width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left",
            }}>
            <span aria-hidden="true" style={{ fontSize: 15, flexShrink: 0 }}>{m.icon}</span>
            <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 650, color: "var(--c-text)", flex: 1 }}>
              {m.label}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3,
              fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", flexShrink: 0,
            }}>
              Move date
              <ChevronRight size={12} strokeWidth={2}
                style={{ transform: editingKey === m.key ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
            </span>
          </button>

          {editingKey === m.key && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 0 11px" }}>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label={`New date for ${m.label}`}
                style={{
                  flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 9,
                  background: "rgba(0,0,0,0.2)", border: "1px solid var(--c-border-strong)",
                  color: "var(--c-text)", fontFamily: UI, fontSize: 14, outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => saveMove(m)}
                disabled={busy}
                style={{
                  flexShrink: 0, padding: "9px 16px", borderRadius: 9,
                  background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.45)",
                  color: "var(--c-accent)", fontFamily: UI, fontSize: 12, fontWeight: 700,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}>
                {busy ? "Moving…" : "Move"}
              </button>
            </div>
          )}
        </div>
      ))}

      {error && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", marginTop: 4, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
      <div style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 8, lineHeight: 1.5 }}>
        Moving a milestone changes only that date. Every season date is editable in Grow settings.
      </div>
    </div>
  );
}
