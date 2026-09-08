import { MONO, Label } from "./styleHelpers.jsx";
import { STAGE_LABEL, cropOf, wizardStages, words } from "../../lib/crops.js";

// "Where are you now" survey: the one question is which stage the plants are in
// today. The app never asks when that stage started, because it would only be
// guessing about days it was not around for. Today is day 0, and every stage
// date after it is written by the grower moving a plant on by hand.
export function StepTimeline({ survey, update }) {
  const crop = cropOf(survey);
  const w = words(crop);
  const stages = wizardStages(crop);
  const stage = survey.currentStage || stages[0].value;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <Label>Where {w.units === "tubs" ? "is this space" : "are your plants"} right now?</Label>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12, lineHeight: 1.6 }}>
          Pick the current stage and your calendar starts right here.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {stages.map(s => {
            const sel = s.value === stage;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => update("currentStage", s.value)}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "13px 13px", borderRadius: 14,
                  background: sel ? "rgba(var(--c-accent-rgb), 0.16)" : "var(--c-surface-1)",
                  border: `1.5px solid ${sel ? "rgba(var(--c-accent-rgb), 0.6)" : "var(--c-surface-2)"}`,
                  display: "flex", flexDirection: "column", gap: 4, minHeight: 78,
                }}>
                <div style={{ fontSize: 22, lineHeight: 1 }}>{s.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: sel ? "var(--c-accent)" : "var(--c-text)" }}>{STAGE_LABEL[s.value]}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-faint)", lineHeight: 1.4 }}>{s.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
        Today is day 0 of this space. We will not ask when this stage started -
        the app only records what it sees. When a {w.unit} moves to its next
        stage, tell it on the {w.Units} tab and that day fills in on the calendar.
      </div>

    </div>
  );
}
