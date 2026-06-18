import { useState } from "react";
import { Label, Input, RadioGroup, MONO, SERIF } from "../SetupWizard/styleHelpers.jsx";
import { HEALTH_OPTIONS } from "./constants.js";

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function LogEntryForm({ initial, onSave, onCancel, saving }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial?.date ?? today);
  const [body, setBody] = useState(initial?.body ?? "");
  const [height, setHeight] = useState(initial?.height != null ? String(initial.height) : "");
  const [heightUnit, setHeightUnit] = useState(initial?.height_unit ?? "in");
  const [health, setHealth] = useState(initial?.health ?? "");

  function submit() {
    const hasHeight = height !== "";
    onSave({
      date,
      body,
      height: hasHeight ? Number(height) : null,
      heightUnit: hasHeight ? heightUnit : null,
      health: health || null,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><Label>Date</Label><Input type="date" value={date} onChange={setDate} /></div>
      <div>
        <Label>Notes</Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What did you observe or do?"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", color: "var(--c-text)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "12px 14px", fontSize: 16, fontFamily: SERIF, outline: "none", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}><Label>Height</Label><Input type="number" value={height} onChange={setHeight} placeholder="optional" /></div>
        <RadioGroup value={heightUnit} onChange={setHeightUnit} options={[{ value: "in", label: "in" }, { value: "cm", label: "cm" }]} />
      </div>
      <div>
        <Label>Health</Label>
        <RadioGroup
          value={health}
          onChange={(v) => setHealth(v === health ? "" : v)}
          options={HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={saving} onClick={submit} style={btn("primary", saving)}>
          {saving ? "Saving…" : "Save entry"}
        </button>
      </div>
    </div>
  );
}
