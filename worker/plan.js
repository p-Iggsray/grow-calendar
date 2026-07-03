// @ts-check
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

// Reader for the LEGACY single-grow plan_config table. The live app works on
// the grows table; this remains only as the fallback/migration source used by
// grows.js (auto-migrate), share.js, push.js, and MJ for accounts that predate
// multi-grow. The old /api/plan endpoints that wrote to this table are gone.
export async function loadRawPlan(env, userId) {
  const row = await env.DB.prepare(
    "SELECT * FROM plan_config WHERE user_id = ?"
  ).bind(userId).first();

  if (!row?.config) {
    return { config: null, overrides: {}, generatedPlan: null, phaseOverrides: {}, survey: null, needsSetup: true };
  }

  let config = DEFAULT_CONFIG;
  try { config = JSON.parse(row.config); }
  catch { console.error("plan_config JSON parse failed; using defaults"); }

  let generatedPlan = null;
  if (row.generated_plan) {
    try { generatedPlan = JSON.parse(row.generated_plan); }
    catch { console.error("generated_plan JSON parse failed"); }
  }

  let phaseOverrides = {};
  if (row.phase_overrides) {
    try { phaseOverrides = JSON.parse(row.phase_overrides); }
    catch { console.error("phase_overrides JSON parse failed"); }
  }

  let survey = null;
  if (row.survey) {
    try { survey = JSON.parse(row.survey); }
    catch { console.error("survey JSON parse failed"); }
  }

  const overrides = {};
  const res = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ?"
  ).bind(userId).all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }

  return { config, overrides, generatedPlan, phaseOverrides, survey, needsSetup: false };
}
