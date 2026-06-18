import { useState } from "react";
import { Label, Input, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";

const BLANK = { name: "", type: "hybrid", photo: true, flowerWeeks: 9 };

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function AddPlantSheet({ onSave, onCancel, saving }) {
  const [f, setF] = useState(BLANK);
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const disabled = saving || !f.name.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><Label>Strain name</Label><Input value={f.name} onChange={(v) => up("name", v)} placeholder="e.g. Blue Dream" /></div>
      <div>
        <Label>Type</Label>
        <RadioGroup value={f.type} onChange={(v) => up("type", v)} options={[
          { value: "indica", label: "Indica" }, { value: "sativa", label: "Sativa" }, { value: "hybrid", label: "Hybrid" },
        ]} />
      </div>
      <div>
        <Label>Photoperiod or autoflower?</Label>
        <RadioGroup value={f.photo ? "photo" : "auto"} onChange={(v) => up("photo", v === "photo")} options={[
          { value: "photo", label: "Photoperiod" }, { value: "auto", label: "Autoflower" },
        ]} />
      </div>
      <div><Label>Expected flower time</Label><NumStepper value={f.flowerWeeks} onChange={(v) => up("flowerWeeks", v)} min={6} max={16} label="weeks" /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={disabled} onClick={() => onSave(f)} style={btn("primary", disabled)}>
          {saving ? "Adding…" : "Add plant"}
        </button>
      </div>
    </div>
  );
}
