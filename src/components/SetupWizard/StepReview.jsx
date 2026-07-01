import { MONO, SERIF } from "./styleHelpers.jsx";
import { WIZARD_STAGES } from "./StepTimeline.jsx";

const STAGE_LABEL = Object.fromEntries(WIZARD_STAGES.map(s => [s.value, s.label]));

const TASK_MODE_LABEL = {
  heuristic: "Full task plan for your setup",
  manual:    "Manual, you add your own tasks",
};

export function StepReview({ survey, taskMode }) {
  const have = Object.values(survey.supplies).filter(v => v === "have").length;
  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;
  const totalPlants = survey.strains.reduce((n, s) => n + (Number(s.count) || 1), 0);

  // One row per strain: "Blue Dream  ×3 · hybrid".
  const strainRows = survey.strains.map((s, i) => [
    i === 0 ? "Strains" : "",
    `${s.name || "(unnamed)"}  ×${Number(s.count) || 1} · ${s.type}`,
  ]);

  const rows = [
    ["Grow", survey.growName || "(unnamed)"],
    ["Environment", survey.environment],
    ["Medium", survey.medium],
    ["Plants", `${totalPlants} × ${survey.containerType !== "ground" ? `${survey.containerGallons}-gal` : "in-ground"}`],
    ...strainRows,
    ["Current stage", STAGE_LABEL[survey.currentStage] || "Seedling"],
    ["Stage started", survey.stageStartDate || "(not set)"],
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
          ? "Review your answers. We will lay out your phase timeline and you add the tasks yourself."
          : "Review your answers. We will build a full task plan tailored to your setup."}
      </div>
      <div style={{
        background: "var(--c-surface-1)", borderRadius: 12,
        border: "1px solid var(--c-surface-2)", overflow: "hidden", marginBottom: 20,
      }}>
        {rows.map(([k, v], i) => (
          <div key={i} style={{
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
