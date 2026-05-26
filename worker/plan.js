import { json, error } from "./util.js";
import { currentUser } from "./auth.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

// GET /api/plan -> { config, overrides }
// config: ISO-date object (DEFAULT_CONFIG if the row is missing/unparseable).
// overrides: map of "YYYY-MM-DD" -> payload object.

export async function loadRawPlan(env) {
  let config = DEFAULT_CONFIG;
  const row = await env.DB.prepare("SELECT config FROM plan_config WHERE id = 1").first();
  if (row?.config) {
    try { config = JSON.parse(row.config); }
    catch { console.error("plan_config JSON parse failed; using defaults"); }
  }
  const overrides = {};
  const res = await env.DB.prepare("SELECT date, payload FROM plan_day_overrides").all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }
  return { config, overrides };
}

export async function getPlan(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

  const { config, overrides } = await loadRawPlan(env);
  return json({ config, overrides });
}
