import { useState } from "react";
import { Label, Input, RadioGroup, MONO } from "../SetupWizard/styleHelpers.jsx";
import { cropOf, words } from "../../lib/crops.js";
import { END_OUTCOMES, PLANT_FATES, endReasons, defaultFate } from "../../lib/growEnding.js";

// Closing out a run without closing the space.
//
// The space stays exactly as it is: its setup, its calendar, its history. What
// this records is the run that just stopped, and what became of everything in
// it. A bed that lost its plants in September is still a bed in April.
//
// The order of the questions is the order somebody thinks in: when, then
// whether it finished or was taken, then why, then the detail, then what
// happened to each individual thing. Nothing below the outcome is asked at all
// until the outcome makes it a real question.

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function btn(kind, disabled) {
  const base = {
    flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO,
    fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer",
  };
  if (kind === "primary") {
    return {
      ...base,
      background: "rgba(var(--c-accent-rgb), 0.15)",
      border: "1px solid rgba(var(--c-accent-rgb), 0.4)",
      color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)",
      opacity: disabled ? 0.6 : 1,
    };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function EndGrowForm({ survey, plants = [], onSave, onCancel, saving }) {
  const crop = cropOf(survey);
  const w = words(crop);

  const [endedOn, setEndedOn] = useState(today);
  const [outcome, setOutcome] = useState("lost");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  // Fates follow the outcome until the grower overrules one, and then that one
  // stays put. A run where two came off fine and one was taken is a real thing
  // and the form should not keep flattening it back.
  const [fates, setFates] = useState({});

  const fateOf = (id) => fates[id] ?? defaultFate(outcome);
  const setFate = (id, value) => setFates((f) => ({ ...f, [id]: value }));

  const needsReason = outcome === "lost";
  const canSave = Boolean(endedOn) && (!needsReason || Boolean(reason)) && !saving;

  function submit() {
    if (!canSave) return;
    onSave({
      endedOn,
      outcome,
      reason: needsReason ? reason : null,
      note: note.trim(),
      plants: plants.map((p) => ({
        id: p.id,
        name: p.name || "",
        status: fateOf(p.id),
        wasStatus: p.status || "growing",
      })),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <Label>What day did it end?</Label>
        <Input type="date" value={endedOn} onChange={setEndedOn} />
      </div>

      <div>
        <Label>How did it end?</Label>
        <RadioGroup
          options={END_OUTCOMES.map((o) => ({ value: o.value, label: o.label }))}
          value={outcome}
          onChange={setOutcome}
        />
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-ghost)", marginTop: 8 }}>
          {END_OUTCOMES.find((o) => o.value === outcome)?.blurb}
        </div>
      </div>

      {needsReason && (
        <div>
          <Label>What ended it?</Label>
          <RadioGroup options={endReasons(crop)} value={reason} onChange={setReason} />
        </div>
      )}

      <div>
        <Label>What happened</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            outcome === "finished"
              ? "How it went, what you would do again"
              : "Write it down while it is fresh. What you saw, when, and anything you would change."
          }
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: "var(--c-surface-1)", color: "var(--c-text)",
            border: "1px solid var(--c-border-strong)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, fontFamily: MONO, lineHeight: 1.5,
            outline: "none",
          }}
        />
      </div>

      {plants.length > 0 && (
        <div>
          <Label>What became of each {w.unit}</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plants.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "10px 12px", borderRadius: 10,
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                }}>
                <span style={{
                  flex: 1, minWidth: 100, fontFamily: MONO, fontSize: 12.5,
                  color: "var(--c-text-dim)", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {p.name || `Unnamed ${w.unit}`}
                </span>
                <RadioGroup options={PLANT_FATES} value={fateOf(p.id)} onChange={(v) => setFate(p.id, v)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-ghost)",
        lineHeight: 1.5, borderTop: "1px solid var(--c-border)", paddingTop: 12,
      }}>
        This space stays where it is, with its setup and everything you have written in it.
        Only the run ends. Add {w.units} again whenever you are ready and it picks straight back up.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} style={btn("ghost", false)} disabled={saving}>
          Cancel
        </button>
        <button type="button" onClick={submit} style={btn("primary", !canSave)} disabled={!canSave}>
          {saving ? "Recording…" : "Record the ending"}
        </button>
      </div>
    </div>
  );
}
