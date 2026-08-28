import { useState } from "react";
import { ymd } from "../../lib/api.js";
import { Label, Input, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";
import { STAGE_OPTIONS } from "./constants.js";

const BLANK = { name: "", type: "hybrid", photo: true, flowerWeeks: 9, potSize: 0, stage: "seedling" };

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

// Shared plant form for both adding and editing. Pass `initial` to prefill
// (edit mode - stage is managed by the one-way stage control there, so the
// stage picker only shows when ADDING) and `saveLabel`/`savingLabel` to
// relabel the primary button.
export default function AddPlantSheet({ onSave, onCancel, saving, initial, saveLabel = "Add plant", savingLabel = "Adding…" }) {
  const isNew = !initial;
  const [f, setF] = useState(() => ({ ...BLANK, ...(initial || {}), potSize: initial?.potSize ?? 0 }));
  const [stageStartDate, setStageStartDate] = useState(() => ymd(new Date()));
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const disabled = saving || !f.name.trim();

  function submit() {
    const out = { ...f, potSize: f.potSize || null };
    if (isNew) out.stageStartDate = stageStartDate;
    else delete out.stage; // edits never change stage; the stage control does
    onSave(out);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><Label>Strain name</Label><Input value={f.name} onChange={(v) => up("name", v)} placeholder="e.g. Blue Dream" /></div>
      {isNew && (
        <>
          <div>
            <Label>Current stage</Label>
            <select
              value={f.stage}
              onChange={(e) => up("stage", e.target.value)}
              aria-label="Current stage"
              style={{
                width: "100%", boxSizing: "border-box", padding: "12px 14px",
                borderRadius: 10, background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
                border: "1px solid rgba(255,255,255,0.14)", fontFamily: MONO, fontSize: 14, outline: "none",
              }}>
              {STAGE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>When did this stage start?</Label>
            <Input type="date" value={stageStartDate} onChange={setStageStartDate} />
          </div>
        </>
      )}
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
      <div><Label>Pot size</Label><NumStepper value={f.potSize} onChange={(v) => up("potSize", v)} min={0} max={100} label="gal" /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={disabled} onClick={submit} style={btn("primary", disabled)}>
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
