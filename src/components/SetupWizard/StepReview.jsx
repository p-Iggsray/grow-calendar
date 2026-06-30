import { MONO, SERIF } from "./styleHelpers.jsx";

const TASK_MODE_LABEL = {
  guided:   "Guided AI plan (full tasks)",
  autofill: "AI auto-fill (full tasks)",
  manual:   "Manual — you'll add your own tasks",
};

export function StepReview({ survey, taskMode }) {
  const primaryStrain = survey.strains[0];
  const secondaryStrain = survey.strains[1];
  const have = Object.values(survey.supplies).filter(v => v === "have").length;
  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;

  const rows = [
    ["Grow", survey.growName || "(unnamed)"],
    ["Environment", survey.environment],
    ["Medium", survey.medium],
    ["Plants", `${survey.plantCount} × ${survey.containerType !== "ground" ? `${survey.containerGallons}-gal` : "in-ground"}`],
    ["Primary strain", primaryStrain?.name || "(unnamed)"],
    secondaryStrain ? ["Secondary strain", secondaryStrain?.name || "(unnamed)"] : null,
    ["Start type", survey.startType],
    ["Transplant", survey.transplantDate || "(not set)"],
    survey.environment === "outdoor"
      ? ["Plant placement", survey.plantsAlreadyOutside ? "Already in final spot" : "Will move outside later"]
      : null,
    ["Veg plan", `${survey.vegWeeks} weeks`],
    ["Location", survey.location || "(not set)"],
    ["Experience", survey.experienceLevel],
    ["Watering", survey.wateringMethod],
    ["Supplies", `${have} have · ${need} to order`],
    taskMode ? ["Tasks", TASK_MODE_LABEL[taskMode]] : null,
  ].filter(Boolean);

  const manual = taskMode === "manual";

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", marginBottom: 14, lineHeight: 1.8 }}>
        {manual
          ? "Review your answers. We'll lay out your phase timeline — you'll add tasks yourself."
          : "Review your answers. The AI will use all of this to build a personalized grow calendar."}
      </div>
      <div style={{
        background: "var(--c-surface-1)", borderRadius: 12,
        border: "1px solid var(--c-surface-2)", overflow: "hidden", marginBottom: 20,
      }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            padding: "10px 14px",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", letterSpacing: 0.5, flexShrink: 0, marginRight: 12 }}>{k}</span>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: "var(--c-text-dim)", textAlign: "right", wordBreak: "break-word" }}>{v}</span>
          </div>
        ))}
      </div>
      {survey.extraNotes?.trim() && (
        <div style={{
          background: "rgba(250,204,21,0.05)", borderRadius: 10,
          border: "1px solid rgba(250,204,21,0.15)", padding: "12px 14px",
          fontFamily: SERIF, fontSize: 13, color: "var(--c-amber-dim)", lineHeight: 1.7, marginBottom: 20,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-harvest)", letterSpacing: 1 }}>NOTES: </span>
          {survey.extraNotes}
        </div>
      )}
    </div>
  );
}
