// Barrel for the grow-plan data modules. The implementation lives in
// src/lib/growdata/; this file keeps the long-standing import path stable for
// the app, the worker, scripts, and tests.
export { phaseGlyph, PHASES, FAMILIES, FAMILY_ORDER, phaseFamily, familyPhases } from "./growdata/phases.js";
export { THREATS, getThreatsForPhase } from "./growdata/threats.js";
export { dpt, hasSecondaryStrain, getPhase } from "./growdata/phase.js";
export { buildMilestones, getNextMilestone, getGrowProgress } from "./growdata/milestones.js";
export { getDetail } from "./growdata/detail.js";
