// @ts-check
import { json } from "./util.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

export function buildSeedConfigJson() {
  return JSON.stringify(DEFAULT_CONFIG);
}

// GET /api/plan -> { config, overrides } for the given user.
export async function loadRawPlan(env, userId) {
  let row = await env.DB.prepare(
    "SELECT config FROM plan_config WHERE user_id = ?",
  ).bind(userId).first();

  if (!row?.config) {
    // Lazy-seed a fresh user with a copy of the default plan.
    const now = new Date().toISOString();
    const seed = buildSeedConfigJson();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO plan_config (user_id, config, updated_at) VALUES (?, ?, ?)",
    ).bind(userId, seed, now).run();
    row = { config: seed };
  }

  let config = DEFAULT_CONFIG;
  try { config = JSON.parse(row.config); }
  catch { console.error("plan_config JSON parse failed; using defaults"); }

  const overrides = {};
  const res = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ?",
  ).bind(userId).all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }
  return { config, overrides };
}

export async function getPlan(env, user) {
  const { config, overrides } = await loadRawPlan(env, user.id);
  return json({ config, overrides });
}
