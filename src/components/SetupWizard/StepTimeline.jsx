import { MONO, SERIF, Label, RadioGroup, NumStepper } from "./styleHelpers.jsx";

export function StepTimeline({ survey, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Starting from</Label>
        <RadioGroup
          value={survey.startType}
          onChange={v => update("startType", v)}
          options={[
            { value: "clone", label: "Clone" },
            { value: "seed",  label: "Seed" },
            { value: "veg",   label: "Already in veg" },
          ]}
        />
      </div>
      <div>
        <Label>Transplant date</Label>
        <input
          type="date"
          value={survey.transplantDate}
          onChange={e => update("transplantDate", e.target.value)}
          style={{
            background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
            outline: "none", width: "100%", boxSizing: "border-box",
            colorScheme: "dark",
          }}
        />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5, lineHeight: 1.7 }}>
          When plants go into their final containers.
        </div>
      </div>
      <div>
        <Label>Planned veg duration</Label>
        <NumStepper
          value={survey.vegWeeks}
          onChange={v => update("vegWeeks", v)}
          min={4} max={20}
          label="weeks"
        />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
          For outdoor photoperiod, the plant decides — estimate how long before pre-flower starts in your area.
        </div>
      </div>
    </div>
  );
}
