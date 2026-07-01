import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { MONO, Label, RadioGroup, NumStepper } from "./styleHelpers.jsx";

function emptyStrain() {
  return { name: "", type: "hybrid", photo: true, flowerWeeks: 9, count: 1 };
}

export function StepStrains({ survey, update }) {
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    let alive = true;
    api.getStrains().then(list => { if (alive) setCatalog(Array.isArray(list) ? list : []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const strains = survey.strains;

  function updateStrain(i, patch) {
    update("strains", strains.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function addStrain() {
    update("strains", [...strains, emptyStrain()]);
  }
  function removeStrain(i) {
    update("strains", strains.filter((_, idx) => idx !== i));
  }

  const totalPlants = strains.reduce((n, s) => n + (Number(s.count) || 1), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.6 }}>
        Add each strain in your grow and how many plants of it you have. Start typing to autofill
        strains other growers have logged.
      </div>

      {strains.map((strain, i) => (
        <StrainRow
          key={i}
          index={i}
          strain={strain}
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
        <Plus size={15} strokeWidth={2.2} /> Add another strain
      </button>

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", textAlign: "center" }}>
        {strains.length} strain{strains.length === 1 ? "" : "s"} · {totalPlants} plant{totalPlants === 1 ? "" : "s"} total
      </div>
    </div>
  );
}

function StrainRow({ index, strain, catalog, canRemove, onChange, onRemove }) {
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
          Strain {index + 1}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove strain" style={{
            background: "none", border: "none", color: "var(--c-text-ghost)", cursor: "pointer",
            display: "flex", alignItems: "center", padding: 4,
          }}>
            <X size={16} strokeWidth={2} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ position: "relative" }}>
          <Label>Strain name</Label>
          <input
            value={strain.name}
            onChange={e => onChange({ name: e.target.value })}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={index === 0 ? "e.g. Blue Dream" : "e.g. OG Kush"}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
              border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
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
                    {c.type} · {c.flowerWeeks}w
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
            options={[
              { value: "indica", label: "Indica" },
              { value: "sativa", label: "Sativa" },
              { value: "hybrid", label: "Hybrid" },
            ]}
          />
        </div>
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
        <div>
          <Label>Expected flower time</Label>
          <NumStepper value={strain.flowerWeeks} onChange={v => onChange({ flowerWeeks: v })} min={6} max={16} label="weeks" />
        </div>
        <div>
          <Label>How many plants of this strain?</Label>
          <NumStepper value={Number(strain.count) || 1} onChange={v => onChange({ count: v })} min={1} max={12} label="plants" />
        </div>
      </div>
    </div>
  );
}
