// @ts-check
import { json } from "./util.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

// GET /api/plan -> { config, overrides, generatedPlan, needsSetup } for the given user.
export async function loadRawPlan(env, userId) {
  const row = await env.DB.prepare(
    "SELECT * FROM plan_config WHERE user_id = ?",
  ).bind(userId).first();

  if (!row?.config) {
    // New user — no plan yet. Caller should prompt for setup.
    return { config: null, overrides: {}, generatedPlan: null, needsSetup: true };
  }

  let config = DEFAULT_CONFIG;
  try { config = JSON.parse(row.config); }
  catch { console.error("plan_config JSON parse failed; using defaults"); }

  let generatedPlan = null;
  if (row.generated_plan) {
    try { generatedPlan = JSON.parse(row.generated_plan); }
    catch { console.error("generated_plan JSON parse failed"); }
  }

  const overrides = {};
  const res = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ?",
  ).bind(userId).all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }
  return { config, overrides, generatedPlan, needsSetup: false };
}

export async function getPlan(env, user) {
  const { config, overrides, generatedPlan, needsSetup } = await loadRawPlan(env, user.id);
  return json({ config, overrides, generatedPlan, needsSetup });
}
