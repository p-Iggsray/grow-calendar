import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { MONO, Label, RadioGroup, NumStepper } from "./styleHelpers.jsx";
import {
  MUSHROOM_SPECIES, cropOf, defaultVarietyType, varietyTypes, words,
} from "../../lib/crops.js";

function emptyStrain(crop) {
  return {
    name: "", type: defaultVarietyType(crop), photo: true,
    flowerWeeks: words(crop).lengthDefault, count: 1,
  };
}

export function StepStrains({ survey, update }) {
  const crop = cropOf(survey);
  const w = words(crop);
  const mushrooms = crop === "mushrooms";
  // Cannabis strains come from what every grower here has logged; the mushroom
  // species are the app's own list, because there is no shared catalogue yet.
  const [catalog, setCatalog] = useState(() => (mushrooms ? MUSHROOM_SPECIES : []));
  useEffect(() => {
    if (mushrooms) return;
    let alive = true;
    api.getStrains().then(list => { if (alive) setCatalog(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { alive = false; };
  }, [mushrooms]);

  const strains = survey.strains;

  function updateStrain(i, patch) {
    update("strains", strains.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addStrain() {
    update("strains", [...strains, emptyStrain(crop)]);
  }
  function removeStrain(i) {
    update("strains", strains.filter((_, idx) => idx !== i));
  }

  const totalPlants = strains.reduce((n, s) => n + (Number(s.count) || 1), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.6 }}>
        Add each {w.variety} in this space and how many {w.units} of it you have.
        {mushrooms
          ? " Start typing to pick from the common monotub species."
          : " Start typing to autofill strains other growers have logged."}
      </div>

      {strains.map((strain, i) => (
        <StrainRow
          key={i}
          index={i}
          strain={strain}
          crop={crop}
          catalog={catalog}
          canRemove={strains.length > 1}
          onChange={patch => updateStrain(i, patch)}
          onRemove={() => removeStrain(i)}
        />
      ))}

      <button
        type="button"
        onClick={addStrain}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          width: "100%", padding: "12px", borderRadius: 12, minHeight: 46,
          background: "var(--c-surface-1)", border: "1px dashed var(--c-border-strong)",
          color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12.5, letterSpacing: 0.5, cursor: "pointer",
        }}>
        <Plus size={15} strokeWidth={2.2} /> Add another {w.variety}
      </button>

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", textAlign: "center" }}>
        {strains.length} {strains.length === 1 ? w.variety : w.varieties} · {totalPlants} {totalPlants === 1 ? w.unit : w.units} total
      </div>
    </div>
  );
}

function StrainRow({ index, strain, crop, catalog, canRemove, onChange, onRemove }) {
  const w = words(crop);
  const mushrooms = cropOf(crop) === "mushrooms";
  const [focused, setFocused] = useState(false);
  const q = strain.name.trim().toLowerCase();
  const suggestions = focused && q.length >= 1
    ? catalog
        .filter(c => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
        .slice(0, 6)
    : [];

  function pick(c) {
    onChange({ name: c.name, type: c.type, flowerWeeks: c.flowerWeeks, photo: c.photo });
    setFocused(false);
  }

  return (
    <div style={{
      background: "var(--c-surface-1)", borderRadius: 12,
      border: "1px solid var(--c-surface-2)", padding: "16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)" }}>
          {w.Variety} {index + 1}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${w.variety}`} style={{
            background: "none", border: "none", color: "var(--c-text-ghost)", cursor: "pointer",
            display: "flex", alignItems: "center", padding: 4,
          }}>
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ position: "relative" }}>
          <Label>{w.Variety} name</Label>
          <input
            value={strain.name}
            onChange={e => onChange({ name: e.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={index === 0 ? w.varietyPlaceholder : w.varietyPlaceholderAlt}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--c-surface-1)", color: "var(--c-text)",
              border: "1px solid var(--c-border-strong)", borderRadius: 10,
              padding: "12px 14px", fontSize: 16, fontFamily: "var(--font-ui)", outline: "none",
            }}
          />
          {suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, marginTop: 4,
              background: "var(--c-panel-bg)", border: "1px solid var(--c-border-strong)",
              borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
            }}>
              {suggestions.map(c => (
                <button
                  key={c.name}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); pick(c); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    width: "100%", textAlign: "left", padding: "10px 13px", cursor: "pointer",
                    background: "none", border: "none", borderBottom: "1px solid var(--c-border-faint)",
                    color: "var(--c-text)", fontFamily: "var(--font-ui)", fontSize: 14,
                  }}>
                  <span>{c.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", textTransform: "uppercase", flexShrink: 0 }}>
                    {c.type}{c.flowerWeeks ? ` · ${c.flowerWeeks}w` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>Type</Label>
          <RadioGroup
            value={strain.type}
            onChange={v => onChange({ type: v })}
            options={varietyTypes(crop)}
          />
        </div>
        {!mushrooms && (
          <div>
            <Label>Photoperiod or autoflower?</Label>
            <RadioGroup
              value={strain.photo ? "photo" : "auto"}
              onChange={v => onChange({ photo: v === "photo" })}
              options={[
                { value: "photo", label: "Photoperiod" },
                { value: "auto", label: "Autoflower" },
              ]}
            />
          </div>
        )}
        <div>
          <Label>{w.lengthLabel}</Label>
          <NumStepper value={strain.flowerWeeks} onChange={v => onChange({ flowerWeeks: v })} min={w.lengthMin} max={w.lengthMax} label={w.lengthUnit} />
        </div>
        <div>
          <Label>{w.countLabel}</Label>
          <NumStepper value={Number(strain.count) || 1} onChange={v => onChange({ count: v })} min={1} max={12} label={w.units} />
        </div>
      </div>
    </div>
  );
}
