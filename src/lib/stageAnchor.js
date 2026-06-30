// Turns the wizard's "current stage + when it started" answer into the fields
// the setup engine needs: a transplant date (the anchor everything else derives
// from), a startType, and the per-plant stage. Pure + unit-tested.

// Days from the START of a stage to transplant day. Mirrors the offsets in
// worker/planSetup.js fillMissingConfigKeys (seedlingStart = transplant-14,
// germinate = transplant-19; flowerStart = transplant+83, etc.). Positive means
// transplant is in the future relative to the stage start.
export const STAGE_TO_TRANSPLANT_OFFSET = {
  germination: 19,
  seedling: 14,
  vegetative: 0,
  flowering: -83,
  flushing: -114,
  harvest: -121,
};

export function stageToStartType(stage) {
  return stage === "germination" || stage === "seedling" ? "seed" : "veg";
}

function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

// Given the current stage and the date it began, the transplant date that makes
// today land in that stage on the calendar.
export function deriveTransplantDate(currentStage, stageStartDate) {
  if (!stageStartDate) return "";
  const off = STAGE_TO_TRANSPLANT_OFFSET[currentStage] ?? 0;
  return addDaysIso(stageStartDate, off);
}

// Returns a copy of the survey ready for setup: transplantDate computed from the
// current stage, startType derived, and every plant tagged with the current
// stage (the grower can fine-tune individual plants later on the Plants tab).
export function resolveSurveyForSetup(survey) {
  const currentStage = survey.currentStage || "seedling";
  const transplantDate = deriveTransplantDate(currentStage, survey.stageStartDate) || survey.transplantDate || survey.stageStartDate;
  const strains = (survey.strains || []).map(s => ({ ...s, stage: currentStage }));
  return {
    ...survey,
    currentStage,
    startType: stageToStartType(currentStage),
    transplantDate,
    strains,
  };
}
