import { MONO, SERIF, Label, RadioGroup, NumStepper } from "./styleHelpers.jsx";

// "Where are you now" survey. Instead of asking for a raw transplant date, the
// grower picks the stage their plants are currently in and when it started; the
// wizard back-computes the whole calendar from that (see SetupWizard.generate)
// so the app opens on the right day.
export const WIZARD_STAGES = [
  { value: "germination", label: "Germination", icon: "🌰", blurb: "Cracking seeds, taproot showing" },
  { value: "seedling",    label: "Seedling",    icon: "🌱", blurb: "First leaves, gentle light" },
  { value: "vegetative",  label: "Vegetative",  icon: "🌿", blurb: "Leafy growth, building structure" },
  { value: "flowering",   label: "Flowering",   icon: "🌸", blurb: "Buds forming" },
  { value: "flushing",    label: "Flushing",    icon: "💧", blurb: "Plain water before harvest" },
  { value: "harvest",     label: "Harvest",     icon: "✂️", blurb: "Ready to cut" },
];

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function StepTimeline({ survey, update }) {
  const stage = survey.currentStage || "seedling";
  const meta = WIZARD_STAGES.find(s => s.value === stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <Label>Where are your plants right now?</Label>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12, lineHeight: 1.6 }}>
          Pick the current stage and we will start your calendar right here.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {WIZARD_STAGES.map(s => {
            const sel = s.value === stage;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => update("currentStage", s.value)}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "13px 13px", borderRadius: 14,
                  background: sel ? "rgba(34,197,94,0.16)" : "var(--c-surface-1)",
                  border: `1.5px solid ${sel ? "rgba(34,197,94,0.6)" : "var(--c-surface-2)"}`,
                  display: "flex", flexDirection: "column", gap: 4, minHeight: 78,
                }}>
                <div style={{ fontSize: 22, lineHeight: 1 }}>{s.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: sel ? "var(--c-accent)" : "var(--c-text)" }}>{s.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-faint)", lineHeight: 1.4 }}>{s.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>When did {meta?.label.toLowerCase() || "this stage"} start?</Label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={survey.stageStartDate}
            onChange={e => update("stageStartDate", e.target.value)}
            style={{
              flex: 1, background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
              border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
              padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
              outline: "none", boxSizing: "border-box", colorScheme: "dark",
            }}
          />
          <button
            type="button"
            onClick={() => update("stageStartDate", todayIso())}
            style={{
              flexShrink: 0, padding: "0 16px", borderRadius: 10,
              background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
              color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5, cursor: "pointer",
            }}>
            Today
          </button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
          {stage === "germination" || stage === "seedling"
            ? "The day you started this stage. Even a rough guess is fine."
            : "Roughly when this stage began. Everything before and after is filled in for you."}
        </div>
      </div>

      {survey.environment === "outdoor" && (
        <div>
          <Label>Plant placement</Label>
          <RadioGroup
            value={survey.plantsAlreadyOutside ? "outside" : "moving"}
            onChange={v => update("plantsAlreadyOutside", v === "outside")}
            options={[
              { value: "outside", label: "Already in final outdoor spot" },
              { value: "moving",  label: "Will move outside later" },
            ]}
          />
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
            Already-placed plants skip the move-outside milestone.
          </div>
        </div>
      )}

      <div>
        <Label>Planned veg duration</Label>
        <NumStepper
          value={survey.vegWeeks}
          onChange={v => update("vegWeeks", v)}
          min={4} max={20}
          label="weeks"
        />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
          How long you plan to veg before flipping to flower (outdoor photoperiod is set by the season).
        </div>
      </div>
    </div>
  );
}
