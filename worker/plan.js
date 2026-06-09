// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

const VALID_PHASES = new Set([
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
]);

// GET /api/plan — returns { config, overrides, generatedPlan, phaseOverrides, survey, needsSetup }
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

export async function getPlan(env, user) {
  const data = await loadRawPlan(env, user.id);
  return json(data);
}

// PATCH /api/plan/config — update driving dates without regenerating AI content.
export async function patchPlanConfig(request, env, user) {
  let body;
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }
  const config = body?.config;
  if (!config || typeof config !== "object") return error(400, "config required");

  const updated = await env.DB.prepare(
    "UPDATE plan_config SET config = ?, updated_at = ? WHERE user_id = ?"
  ).bind(JSON.stringify(config), new Date().toISOString(), user.id).run();

  if (updated.meta.changes === 0) return error(404, "plan not found — run setup first");
  return json({ ok: true });
}

// PUT /api/plan/phase/:phase — save a full task-array override for one phase.
export async function putPlanPhase(request, env, user, phase) {
  if (!VALID_PHASES.has(phase)) return error(400, "invalid phase");

  let body;
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const row = await env.DB.prepare(
    "SELECT phase_overrides FROM plan_config WHERE user_id = ?"
  ).bind(user.id).first();
  if (!row) return error(404, "plan not found");

  let phaseOverrides = {};
  if (row.phase_overrides) {
    try { phaseOverrides = JSON.parse(row.phase_overrides); }
    catch { /* start fresh */ }
  }

  if (body === null) {
    delete phaseOverrides[phase];
  } else {
    phaseOverrides[phase] = body;
  }

  await env.DB.prepare(
    "UPDATE plan_config SET phase_overrides = ?, updated_at = ? WHERE user_id = ?"
  ).bind(JSON.stringify(phaseOverrides), new Date().toISOString(), user.id).run();

  return json({ ok: true });
}

// DELETE /api/plan/phase/:phase — clear a phase override, reverting to AI content.
export async function deletePlanPhase(env, user, phase) {
  if (!VALID_PHASES.has(phase)) return error(400, "invalid phase");

  const row = await env.DB.prepare(
    "SELECT phase_overrides FROM plan_config WHERE user_id = ?"
  ).bind(user.id).first();
  if (!row) return error(404, "plan not found");

  let phaseOverrides = {};
  if (row.phase_overrides) {
    try { phaseOverrides = JSON.parse(row.phase_overrides); }
    catch { /* already empty */ }
  }

  delete phaseOverrides[phase];

  await env.DB.prepare(
    "UPDATE plan_config SET phase_overrides = ?, updated_at = ? WHERE user_id = ?"
  ).bind(JSON.stringify(phaseOverrides), new Date().toISOString(), user.id).run();

  return json({ ok: true });
}
