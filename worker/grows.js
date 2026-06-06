// @ts-check
import { json, error } from "./util.js";
import { logError } from "./log.js";
import {
  buildSetupPrompt,
  extractJson,
  fillMissingConfigKeys,
  REQUIRED_CONFIG_KEYS,
  geminiBase,
  SETUP_MODEL,
} from "./planSetup.js";

const VALID_PHASES = new Set([
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
]);

function newGrowId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Auto-migrate plan_config → grows table if user has no grows yet.
async function ensureMigrated(env, userId) {
  const existing = await env.DB.prepare(
    "SELECT id FROM grows WHERE user_id = ? LIMIT 1"
  ).bind(userId).first();
  if (existing) return;

  const planRow = await env.DB.prepare(
    "SELECT * FROM plan_config WHERE user_id = ?"
  ).bind(userId).first();
  if (!planRow?.config) return;

  let displayName = "2026 Season";
  if (planRow.generated_plan) {
    try {
      const gp = JSON.parse(planRow.generated_plan);
      if (gp.growName) displayName = gp.growName;
    } catch { /* use default name */ }
  }

  const id = newGrowId();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO grows
      (id, user_id, display_name, status, config, survey, generated_plan, phase_overrides, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, userId, displayName,
    planRow.config,
    planRow.survey   ?? null,
    planRow.generated_plan  ?? null,
    planRow.phase_overrides ?? null,
    planRow.updated_at || now,
    now,
  ).run();
}

function parseField(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// GET /api/grows
export async function listGrows(env, user) {
  await ensureMigrated(env, user.id);

  const res = await env.DB.prepare(
    `SELECT id, display_name, status, config, survey, generated_plan, created_at, updated_at
     FROM grows WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(user.id).all();

  return json((res.results ?? []).map(r => ({
    id:            r.id,
    displayName:   r.display_name,
    status:        r.status,
    config:        parseField(r.config),
    survey:        parseField(r.survey),
    generatedPlan: parseField(r.generated_plan),
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  })));
}

// POST /api/grows
export async function createGrow(request, env, user) {
  let body = {};
  try { body = await request.json(); } catch { /* body is optional */ }

  const id = newGrowId();
  const now = new Date().toISOString();
  const displayName = (body.displayName || "New Grow").slice(0, 100);

  await env.DB.prepare(
    `INSERT INTO grows (id, user_id, display_name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).bind(id, user.id, displayName, now, now).run();

  return json({ id, displayName, status: "active", createdAt: now });
}

// GET /api/grows/:id
export async function getGrow(env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT * FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  const overridesRes = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ?"
  ).bind(user.id).all();

  const overrides = {};
  for (const r of overridesRes.results ?? []) {
    try { overrides[r.date] = JSON.parse(r.payload); } catch { /* skip corrupt override */ }
  }

  const config        = parseField(row.config);
  const generatedPlan = parseField(row.generated_plan);
  const phaseOverrides = parseField(row.phase_overrides) ?? {};
  const survey        = parseField(row.survey);

  return json({
    id:           row.id,
    displayName:  row.display_name,
    status:       row.status,
    config,
    overrides,
    generatedPlan,
    phaseOverrides,
    survey,
    needsSetup:   !config,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  });
}

// PATCH /api/grows/:id
export async function patchGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const fields = [];
  const binds = [];

  if (typeof body.displayName === "string") {
    fields.push("display_name = ?");
    binds.push(body.displayName.slice(0, 100));
  }
  if (["active", "harvested", "abandoned"].includes(body.status)) {
    fields.push("status = ?");
    binds.push(body.status);
  }
  if (body.config && typeof body.config === "object") {
    fields.push("config = ?");
    binds.push(JSON.stringify(body.config));
  }

  if (fields.length === 0) return json({ ok: true });

  fields.push("updated_at = ?");
  binds.push(new Date().toISOString(), growId, user.id);

  await env.DB.prepare(
    `UPDATE grows SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
  ).bind(...binds).run();

  return json({ ok: true });
}

// DELETE /api/grows/:id
export async function deleteGrow(env, user, growId) {
  await env.DB.prepare(
    "DELETE FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).run();
  return json({ ok: true });
}

// POST /api/grows/:id/setup — AI-generate plan for a specific grow
export async function setupGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const survey = body?.survey;
  if (!survey || typeof survey !== "object") return error(400, "survey required");
  if (!survey.transplantDate) return error(400, "survey.transplantDate required");
  if (!Array.isArray(survey.strains) || survey.strains.length === 0)
    return error(400, "survey.strains required");

  const prompt = buildSetupPrompt(survey);

  let rawText = "";
  try {
    const base = geminiBase(env.CF_AI_GATEWAY_URL ?? null);
    const headers = {
      "x-goog-api-key": env.GEMINI_API_KEY,
      "content-type": "application/json",
    };
    if (user?.id != null) headers["cf-aig-metadata"] = JSON.stringify({ user_id: String(user.id) });
    const res = await fetch(`${base}/${SETUP_MODEL}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 8000 },
        },
      }),
    });
    if (res.status === 429) return error(429, "AI quota reached. Please try again in a few minutes.");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logError("grows-setup-gemini-error", { status: res.status, detail: detail.slice(0, 500) });
      return error(502, "AI generation failed. Please try again.");
    }
    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  } catch (err) {
    logError("grows-setup-fetch-error", { message: String(err?.message) });
    return error(502, "Could not reach AI service. Please try again.");
  }

  let generatedPlan;
  try { generatedPlan = JSON.parse(extractJson(rawText)); }
  catch {
    logError("grows-setup-json-parse", { raw: rawText.slice(0, 800) });
    return error(502, "AI returned an unparseable plan. Please try again.");
  }

  const config = generatedPlan?.config;
  if (!config || typeof config !== "object")
    return error(502, "AI did not produce a valid config. Please try again.");

  fillMissingConfigKeys(config, survey);

  const missing = REQUIRED_CONFIG_KEYS.filter(k => !config[k]);
  if (missing.length > 0) {
    logError("grows-setup-missing-keys", { missing, config });
    return error(502, "Generated plan is incomplete. Please try again.");
  }

  // Use the AI-generated grow name as the display name if available.
  const displayName = generatedPlan.growName || survey.growName || "My Grow";
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE grows
     SET display_name = ?, config = ?, survey = ?, generated_plan = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    displayName,
    JSON.stringify(config),
    JSON.stringify(survey),
    JSON.stringify(generatedPlan),
    now,
    growId,
    user.id,
  ).run();

  return json({ ok: true, config, generatedPlan, displayName });
}

// POST /api/grows/:id/regenerate — re-run AI using stored survey, update generated_plan only
export async function regenerateGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");
  if (!row.survey) return error(400, "no survey on file — complete initial setup first");

  let survey;
  try { survey = JSON.parse(row.survey); }
  catch { return error(500, "stored survey is corrupt — re-run full setup"); }

  const prompt = buildSetupPrompt(survey);
  let rawText = "";
  try {
    const base = geminiBase(env.CF_AI_GATEWAY_URL ?? null);
    const headers = {
      "x-goog-api-key": env.GEMINI_API_KEY,
      "content-type": "application/json",
    };
    if (user?.id != null) headers["cf-aig-metadata"] = JSON.stringify({ user_id: String(user.id) });
    const res = await fetch(`${base}/${SETUP_MODEL}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          thinkingConfig: { thinkingBudget: 8000 },
        },
      }),
    });
    if (res.status === 429) return error(429, "AI quota reached. Please try again in a few minutes.");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logError("grows-regen-gemini-error", { status: res.status, detail: detail.slice(0, 500) });
      return error(502, "AI generation failed. Please try again.");
    }
    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  } catch (err) {
    logError("grows-regen-fetch-error", { message: String(err?.message) });
    return error(502, "Could not reach AI service. Please try again.");
  }

  let generatedPlan;
  try { generatedPlan = JSON.parse(extractJson(rawText)); }
  catch {
    logError("grows-regen-json-parse", { raw: rawText.slice(0, 800) });
    return error(502, "AI returned an unparseable plan. Please try again.");
  }

  await env.DB.prepare(
    "UPDATE grows SET generated_plan = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(generatedPlan), new Date().toISOString(), growId, user.id).run();

  return json({ ok: true, generatedPlan });
}

// PUT /api/grows/:id/phase/:phase
export async function putGrowPhase(request, env, user, growId, phase) {
  if (!VALID_PHASES.has(phase)) return error(400, "invalid phase");

  const row = await env.DB.prepare(
    "SELECT phase_overrides FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const phaseOverrides = parseField(row.phase_overrides) ?? {};
  if (body === null) {
    delete phaseOverrides[phase];
  } else {
    phaseOverrides[phase] = body;
  }

  await env.DB.prepare(
    "UPDATE grows SET phase_overrides = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(phaseOverrides), new Date().toISOString(), growId, user.id).run();

  return json({ ok: true });
}

// DELETE /api/grows/:id/phase/:phase
export async function deleteGrowPhase(env, user, growId, phase) {
  if (!VALID_PHASES.has(phase)) return error(400, "invalid phase");

  const row = await env.DB.prepare(
    "SELECT phase_overrides FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  const phaseOverrides = parseField(row.phase_overrides) ?? {};
  delete phaseOverrides[phase];

  await env.DB.prepare(
    "UPDATE grows SET phase_overrides = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(phaseOverrides), new Date().toISOString(), growId, user.id).run();

  return json({ ok: true });
}
