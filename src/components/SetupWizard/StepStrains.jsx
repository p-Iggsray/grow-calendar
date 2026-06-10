import { MONO, Label, Input, RadioGroup, NumStepper } from "./styleHelpers.jsx";

export function StepStrains({ survey, update }) {
  function updateStrain(i, field, value) {
    const strains = survey.strains.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    update("strains", strains);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {survey.strains.map((strain, i) => (
        <div key={i} style={{
          background: "var(--c-surface-1)", borderRadius: 12,
          border: "1px solid var(--c-surface-2)", padding: "16px",
        }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)", marginBottom: 12 }}>
            Plant {i + 1} {i === 0 ? "(primary)" : "(secondary)"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>Strain name</Label>
              <Input
                value={strain.name}
                onChange={v => updateStrain(i, "name", v)}
                placeholder={i === 0 ? "e.g. Blue Dream" : "e.g. OG Kush"}
              />
            </div>
            <div>
              <Label>Type</Label>
              <RadioGroup
                value={strain.type}
                onChange={v => updateStrain(i, "type", v)}
                options={[
                  { value: "indica",  label: "Indica" },
                  { value: "sativa",  label: "Sativa" },
                  { value: "hybrid",  label: "Hybrid" },
                ]}
              />
            </div>
            <div>
              <Label>Photoperiod or autoflower?</Label>
              <RadioGroup
                value={strain.photo ? "photo" : "auto"}
                onChange={v => updateStrain(i, "photo", v === "photo")}
                options={[
                  { value: "photo", label: "Photoperiod" },
                  { value: "auto",  label: "Autoflower" },
                ]}
              />
            </div>
            <div>
              <Label>Expected flower time</Label>
              <NumStepper
                value={strain.flowerWeeks}
                onChange={v => updateStrain(i, "flowerWeeks", v)}
                min={6} max={16}
                label="weeks"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
