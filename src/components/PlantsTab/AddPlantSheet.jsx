import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";
import { STAGE_OPTIONS } from "./constants.js";
import AutocompleteInput from "../AutocompleteInput.jsx";

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
  // Strains other growers have logged, offered as you type.
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    let alive = true;
    api.getStrains()
      .then((list) => { if (alive) setCatalog(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const disabled = saving || !f.name.trim();

  function submit() {
    const out = { ...f, potSize: f.potSize || null };
    // Edits never change stage; the one-way stage control does that.
    if (!isNew) delete out.stage;
    onSave(out);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        {/* A plant's name is typed, like every other name in the app. The
            shared catalogue only suggests as you go, and picking a suggestion
            fills in what other growers recorded about that strain. */}
        <Label>Strain name</Label>
        <AutocompleteInput
          value={f.name}
          onChange={(v) => up("name", v)}
          suggestions={catalog}
          getLabel={(c) => c?.name ?? ""}
          getDetail={(c) => [c?.type, c?.flowerWeeks ? `${c.flowerWeeks}wk` : null].filter(Boolean).join(" · ")}
          onPick={(c) => setF((prev) => ({
            ...prev,
            name: c.name,
            type: c.type ?? prev.type,
            photo: typeof c.photo === "boolean" ? c.photo : prev.photo,
            flowerWeeks: c.flowerWeeks ?? prev.flowerWeeks,
          }))}
          placeholder="e.g. Blue Dream"
        />
      </div>
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
                borderRadius: 10, background: "var(--c-surface-1)", color: "var(--c-text)",
                border: "1px solid var(--c-border-strong)", fontFamily: MONO, fontSize: 14, outline: "none",
              }}>
              {STAGE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.7, marginTop: -6 }}>
            This plant starts at day 0 today. Its next stage gets a date when you
            move it on yourself.
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
