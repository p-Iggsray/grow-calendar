import { useState } from "react";
import { Label, Input, RadioGroup, MONO } from "../SetupWizard/styleHelpers.jsx";
import { cropOf, words } from "../../lib/crops.js";
import { endReasons } from "../../lib/growEnding.js";

// Declaring one plant dead, on its own, mid-run.
//
// Ending a whole grow is a different act with its own flow. This is the one
// that goes wrong in the middle: a plant is taken, or damps off, or gets eaten,
// and the rest of the space carries on around it. Archiving it would file it as
// harvested, which is a lie the record never recovers from, so it gets its own
// status and its own reason.
//
// The date and the reason are asked for because "dead" alone is the half of the
// fact nobody needs. Only the day is required: sometimes you genuinely do not
// know what got it, and being unable to record the loss without naming a cause
// would be worse than an unexplained one.

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MarkDeadSheet({ crop, onSave, onCancel, saving }) {
  const w = words(crop);
  const [diedOn, setDiedOn] = useState(today);
  const [deathReason, setDeathReason] = useState("");
  const [deathNote, setDeathNote] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
      <div>
        <Label>What day</Label>
        <Input type="date" value={diedOn} onChange={setDiedOn} />
      </div>

      <div>
        <Label>What happened to it (optional)</Label>
        <RadioGroup
          options={endReasons(cropOf(crop))}
          value={deathReason}
          onChange={(v) => setDeathReason(v === deathReason ? "" : v)}
        />
      </div>

      <div>
        <Label>Anything worth remembering (optional)</Label>
        <textarea
          value={deathNote}
          onChange={(e) => setDeathNote(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What you saw, and anything you would do differently"
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: "var(--c-surface-1)", color: "var(--c-text)",
            border: "1px solid var(--c-border-strong)", borderRadius: 10,
            padding: "11px 13px", fontSize: 16, fontFamily: MONO, lineHeight: 1.5,
            outline: "none",
          }}
        />
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-ghost)", lineHeight: 1.5 }}>
        The {w.unit} keeps its whole log, its photos and its history. It moves out of
        the growing list and is marked lost rather than harvested.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12,
            letterSpacing: 1, background: "transparent", border: "1px solid var(--c-border)",
            color: "var(--c-text-muted)", cursor: saving ? "default" : "pointer",
          }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave({ diedOn, deathReason: deathReason || null, deathNote: deathNote.trim() || null })}
          disabled={saving || !diedOn}
          style={{
            flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12,
            letterSpacing: 1, background: "rgba(247, 215, 116, 0.12)",
            border: "1px solid rgba(247, 215, 116, 0.4)", color: "var(--c-warn)",
            cursor: saving || !diedOn ? "default" : "pointer", opacity: saving || !diedOn ? 0.6 : 1,
          }}>
          {saving ? "Recording…" : "Mark it lost"}
        </button>
      </div>
    </div>
  );
}
