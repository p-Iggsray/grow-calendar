import { MONO, Label } from "./styleHelpers.jsx";

// "Where are you now" survey: the one question is which stage the plants are in
// today. The app never asks when that stage started, because it would only be
// guessing about days it was not around for. Today is day 0, and every stage
// date after it is written by the grower moving a plant on by hand.
export const WIZARD_STAGES = [
  { value: "germination", label: "Germination", icon: "🌰", blurb: "Cracking seeds, taproot showing" },
  { value: "seedling",    label: "Seedling",    icon: "🌱", blurb: "First leaves, gentle light" },
  { value: "vegetative",  label: "Vegetative",  icon: "🌿", blurb: "Leafy growth, building structure" },
  { value: "flowering",   label: "Flowering",   icon: "🌸", blurb: "Buds forming" },
  { value: "flushing",    label: "Flushing",    icon: "💧", blurb: "Plain water before harvest" },
  { value: "harvest",     label: "Harvest",     icon: "✂️", blurb: "Ready to cut" },
];

export function StepTimeline({ survey, update }) {
  const stage = survey.currentStage || "seedling";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <Label>Where are your plants right now?</Label>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12, lineHeight: 1.6 }}>
          Pick the current stage and your calendar starts right here.
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

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
        Today is day 0 of this space. We will not ask when this stage started -
        the app only records what it sees. When a plant moves to its next stage,
        tell it on the Plants tab and that day fills in on the calendar.
      </div>

    </div>
  );
}
