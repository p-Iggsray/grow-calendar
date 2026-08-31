// Turns the wizard's "which stage are you in, and when did it start" answer
// into the roster the app stores. There are no derived dates here any more:
// the only date in play is the one the grower gave, and it becomes day 1 of the
// space when the stage entries are seeded. Pure + unit-tested.

// Returns a copy of the survey ready for setup: each strain expanded into one
// roster entry per plant (count), every plant tagged with the current stage
// (the grower can advance individual plants later on the Plants tab).
export function resolveSurveyForSetup(survey) {
  const currentStage = survey.currentStage || "seedling";

  // Expand each strain into `count` roster entries (same strain name - they're
  // the same strain, just different plants, distinguished by id). Keeping the
  // plain name means the shared strain catalog records the clean base name.
  const strains = [];
  for (const s of survey.strains || []) {
    const count = Math.max(1, Math.min(12, Number(s.count) || 1));
    const { count: _drop, ...base } = s;
    for (let i = 0; i < count; i++) {
      strains.push({ ...base, stage: currentStage });
    }
  }

  return {
    ...survey,
    currentStage,
    plantCount: strains.length,
    strains,
  };
}
