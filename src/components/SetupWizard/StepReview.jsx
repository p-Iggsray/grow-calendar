import { MONO, SERIF } from "./styleHelpers.jsx";
import { STAGE_LABEL, cropOf, defaultStage, words } from "../../lib/crops.js";

export function StepReview({ survey }) {
  const crop = cropOf(survey);
  const w = words(crop);
  const mushrooms = crop === "mushrooms";
  const have = Object.values(survey.supplies).filter(v => v === "have").length;
  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;
  const totalPlants = survey.strains.reduce((n, s) => n + (Number(s.count) || 1), 0);

  // One row per variety: "Blue Dream  ×3 · hybrid".
  const strainRows = survey.strains.map((s, i) => [
    i === 0 ? w.Varieties : "",
    `${s.name || "(unnamed)"}  ×${Number(s.count) || 1} · ${s.type}`,
  ]);

  const container = mushrooms
    ? `${survey.containerGallons}-qt ${survey.containerType}`
    : (survey.containerType !== "ground" ? `${survey.containerGallons}-gal` : "in-ground");

  const rows = [
    ["Space", survey.growName || "(unnamed)"],
    ["Growing", w.cropLabel],
    mushrooms ? null : ["Environment", survey.environment],
    [mushrooms ? "Substrate" : "Medium", survey.medium],
    [w.Units, `${totalPlants} × ${container}`],
    ...strainRows,
    ["Current stage", STAGE_LABEL[survey.currentStage] ?? STAGE_LABEL[defaultStage(crop)]],
    mushrooms ? null : ["Location", survey.location || "(not set)"],
    ["Experience", survey.experienceLevel],
    [mushrooms ? "Hydration" : "Watering", survey.wateringMethod],
    ["Supplies", `${have} have · ${need} to order`],
  ].filter(Boolean);

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", marginBottom: 14, lineHeight: 1.8 }}>
        Review your answers. Your calendar starts today at day 0 and fills in from there, as you record what actually happens.
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
