import { useState } from "react";
import { ymd } from "../../lib/api.js";
import { Label, Input, RadioGroup, MONO, SERIF } from "../SetupWizard/styleHelpers.jsx";
import { HEALTH_OPTIONS, FORM_KINDS } from "./constants.js";

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

const num = (v) => (v === "" || v == null ? undefined : Number(v));
const str = (v) => { const s = String(v ?? "").trim(); return s || undefined; };

export default function LogEntryForm({ initial, onSave, onCancel, saving }) {
  const today = ymd(new Date()); // local calendar day, not UTC
  const [kind, setKind] = useState(initial?.kind ?? "note");
  const [date, setDate] = useState(initial?.date ?? today);
  const [body, setBody] = useState(initial?.body ?? "");
  const [height, setHeight] = useState(initial?.height != null ? String(initial.height) : "");
  const [heightUnit, setHeightUnit] = useState(initial?.height_unit ?? "in");
  const [health, setHealth] = useState(initial?.health ?? "");
  const [d, setD] = useState(initial?.detail ?? {});
  const sd = (k, v) => setD((prev) => ({ ...prev, [k]: v }));

  function buildDetail() {
    let obj = {};
    if (kind === "watering") obj = { gal: num(d.gal), ec_in: num(d.ec_in), ec_out: num(d.ec_out) };
    else if (kind === "nutrients") obj = { mix: str(d.mix), dose: str(d.dose) };
    else if (kind === "training") obj = { action: str(d.action) };
    else if (kind === "environment") obj = { temp_high: num(d.temp_high), temp_low: num(d.temp_low), humidity: num(d.humidity) };
    else return null;
    const clean = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && !(typeof v === "number" && Number.isNaN(v))) clean[k] = v;
    return Object.keys(clean).length ? clean : null;
  }

  function submit() {
    const hasHeight = kind === "measurement" && height !== "";
    onSave({
      date, kind, body,
      height: hasHeight ? Number(height) : null,
      heightUnit: hasHeight ? heightUnit : null,
      health: kind === "health" ? (health || null) : null,
      detail: buildDetail(),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label>Type</Label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FORM_KINDS.map((k) => {
            const active = kind === k.value;
            return (
              <button key={k.value} type="button" onClick={() => setKind(k.value)}
                style={{
                  padding: "7px 12px", borderRadius: 14,
                  background: active ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid rgba(74,222,128,0.5)" : "1px solid var(--c-border-strong)",
                  color: active ? "var(--c-accent)" : "var(--c-text-muted)",
                  fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, cursor: "pointer",
                }}>
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div><Label>Date</Label><Input type="date" value={date} onChange={setDate} /></div>

      {kind === "measurement" && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}><Label>Height</Label><Input type="number" value={height} onChange={setHeight} placeholder="0" /></div>
          <RadioGroup value={heightUnit} onChange={setHeightUnit} options={[{ value: "in", label: "in" }, { value: "cm", label: "cm" }]} />
        </div>
      )}

      {kind === "watering" && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Label>Water (gal)</Label><Input type="number" value={d.gal ?? ""} onChange={(v) => sd("gal", v)} placeholder="0" /></div>
          <div style={{ flex: 1 }}><Label>EC in</Label><Input type="number" value={d.ec_in ?? ""} onChange={(v) => sd("ec_in", v)} placeholder="-" /></div>
          <div style={{ flex: 1 }}><Label>EC out</Label><Input type="number" value={d.ec_out ?? ""} onChange={(v) => sd("ec_out", v)} placeholder="-" /></div>
        </div>
      )}

      {kind === "nutrients" && (
        <>
          <div><Label>Product / mix</Label><Input value={d.mix ?? ""} onChange={(v) => sd("mix", v)} placeholder="e.g. Fox Farm Trio" /></div>
          <div><Label>Dose</Label><Input value={d.dose ?? ""} onChange={(v) => sd("dose", v)} placeholder="e.g. half strength, 5ml/gal" /></div>
        </>
      )}

      {kind === "training" && (
        <div><Label>Action</Label><Input value={d.action ?? ""} onChange={(v) => sd("action", v)} placeholder="LST, topped, defoliated…" /></div>
      )}

      {kind === "environment" && (
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Label>Temp high</Label><Input type="number" value={d.temp_high ?? ""} onChange={(v) => sd("temp_high", v)} placeholder="°F" /></div>
          <div style={{ flex: 1 }}><Label>Temp low</Label><Input type="number" value={d.temp_low ?? ""} onChange={(v) => sd("temp_low", v)} placeholder="°F" /></div>
          <div style={{ flex: 1 }}><Label>Humidity</Label><Input type="number" value={d.humidity ?? ""} onChange={(v) => sd("humidity", v)} placeholder="%" /></div>
        </div>
      )}

      {kind === "health" && (
        <div>
          <Label>Health</Label>
          <RadioGroup value={health} onChange={(v) => setHealth(v === health ? "" : v)} options={HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        </div>
      )}

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

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={saving} onClick={submit} style={btn("primary", saving)}>
          {saving ? "Saving…" : "Save entry"}
        </button>
      </div>
    </div>
  );
}
