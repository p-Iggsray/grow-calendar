// @ts-check
import { json, error } from "./util.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";
import { logError } from "./log.js";

export const GEMINI_DIRECT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const SETUP_MODEL = "gemini-2.5-pro";

export function geminiBase(gatewayBase) {
  return gatewayBase
    ? `${gatewayBase}/google-ai-studio/v1beta/models`
    : GEMINI_DIRECT_BASE;
}

export const REQUIRED_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

export function buildSetupPrompt(survey) {
  const today = new Date().toLocaleDateString("en-CA");
  return `You are an expert cannabis cultivation planner. A grower filled out a new-grow survey. Generate a complete grow calendar JSON tailored to their specific situation.

TODAY: ${today}

GROW SURVEY:
${JSON.stringify(survey, null, 2)}

PHASE SYSTEM (your dates must be compatible with these phase keys):
- "pre": before transplant (hardening off)
- "transplant": transplant day
- "early_veg": days 1-13 post-transplant (plain water only)
- "veg_cm": days 14-27 post-transplant (Cal-Mag begins)
- "veg_half": days 28-41 post-transplant (half-dose nutrients)
- "veg_full": days 42+ until pre-flower (full-dose nutrients)
- "flush": routine mid-season flush days (flush1/flush2/flush3)
- "pre_flower": transition to flower
- "flower": flowering period for primary strain (maps to "gdp")
- "flush_gdp": primary strain pre-harvest flush
- "harvest_gdp": primary strain harvest
- "flower_haze": secondary strain late flower (if two strains)
- "flush_haze": secondary strain pre-harvest flush
- "harvest_haze": secondary strain harvest

DATE CALCULATION RULES:
- start = 2-3 days before transplant for hardening off (or = transplant if skipping)
- calMag = transplant + 14 days
- feedStart = transplant + 28 days
- fullDose = transplant + 42 days
- flush1/flush2/flush3: routine flushes ~30 days apart (flush1 ≈ feedStart + 3 days, flush2 ≈ flush1 + 30, flush3 ≈ flush2 + 30)
- backyardMove: for outdoor grows, when plants move to final outdoor spot. For indoor: same as transplant
- preFlower: for outdoor photo-period plants, late July/early August in northern hemisphere; for indoor: when 12/12 schedule starts
- flowerStart: preFlower + 10-14 days (when flowers clearly set)
- gdpFlush: gdpHarvest minus 7-14 days (indica: 7d, sativa: 14d)
- gdpHarvest: transplant + vegWeeks*7 + flowerWeeks*7 for primary strain
- If single strain: hazeFlush = gdpFlush, hazeHarvest = gdpHarvest
- If two strains: secondary strain harvest is based on its own flower time

OUTPUT REQUIREMENTS:
Respond with ONLY a valid JSON object (no markdown, no code blocks, no explanation).
All tasks must be actionable, specific to this grower's actual strains, nutrients, medium, container size, and environment.

{
  "config": {
    "start": "YYYY-MM-DD",
    "transplant": "YYYY-MM-DD",
    "calMag": "YYYY-MM-DD",
    "feedStart": "YYYY-MM-DD",
    "fullDose": "YYYY-MM-DD",
    "flush1": "YYYY-MM-DD",
    "flush2": "YYYY-MM-DD",
    "flush3": "YYYY-MM-DD",
    "backyardMove": "YYYY-MM-DD",
    "preFlower": "YYYY-MM-DD",
    "flowerStart": "YYYY-MM-DD",
    "gdpFlush": "YYYY-MM-DD",
    "gdpHarvest": "YYYY-MM-DD",
    "hazeFlush": "YYYY-MM-DD",
    "hazeHarvest": "YYYY-MM-DD"
  },
  "growName": "descriptive name for this grow (strain names + year)",
  "strains": [
    { "name": "strain name", "type": "indica|sativa|hybrid", "photo": true, "slot": "primary" },
    { "name": "strain name", "type": "indica|sativa|hybrid", "photo": true, "slot": "secondary" }
  ],
  "phases": {
    "pre": {
      "days": [
        { "title": "Pre-Transplant — Prep Day", "summary": "1-2 sentences: what to accomplish today before hardening begins.", "tasks": ["6-8 detailed prep tasks specific to this grow (supplies check, space setup, etc.)"], "notes": "optional tip or reminder" },
        { "title": "Harden Off — Day 1 of 3", "summary": "1-2 sentences about first outdoor exposure.", "tasks": ["6-8 tasks: temperature check, duration, what to watch for, etc."], "notes": "optional tip" },
        { "title": "Harden Off — Day 2 of 3", "summary": "1-2 sentences about extended hardening + final transplant prep.", "tasks": ["6-8 tasks: extended sun time, moisture management, pre-transplant checklist"], "notes": "optional tip" }
      ]
    },
    "transplant": {
      "title": "TRANSPLANT DAY",
      "summary": "1-2 sentences: the goal of today and what the grower is moving into.",
      "tasks": ["8-10 ordered transplant steps specific to their medium, container size, number of plants, and whether they are clones or seedlings. Cover: soil mixing, pot setup, transplant technique, first watering, staking, post-transplant care."],
      "notes": "Critical reminder about no nutrients for the first N days and what to watch for in the first 48 hours."
    },
    "early_veg": { "summary": "2-3 sentence overview.", "tasks": ["6-8 tasks"], "notes": "..." },
    "veg_cm": { "summary": "...", "tasks": ["..."], "notes": "..." },
    "veg_half": { "summary": "...", "tasks": ["..."], "notes": "..." },
    "veg_full": { "summary": "...", "tasks": ["..."], "notes": "..." },
    "pre_flower": { "summary": "...", "tasks": ["..."], "notes": "..." },
    "flower": { "summary": "...", "tasks": ["..."], "notes": "..." },
    "flush": {
      "summary": "1-2 sentences: monthly salt-flush purpose specific to their nutrient line.",
      "tasks": ["6-7 tasks: moisture check first, plain water only, amount to use, visual inspection during flush, when to resume feeding"],
      "notes": "Why this matters for their specific nutrient brand."
    },
    "flush_gdp": {
      "summary": "1-2 sentences: primary strain pre-harvest flush. Duration: 7 days for indica, 14 days for sativa/hybrid.",
      "tasks": ["6-7 tasks: plain water only for this strain, trichome inspection schedule, what the other strain(s) are doing during this window, signs of ripeness to watch"],
      "notes": "Target trichome ratio and harvest window."
    },
    "harvest_gdp": {
      "title": "HARVEST — [Primary strain name]",
      "summary": "1-2 sentences: the primary strain comes down today.",
      "tasks": ["8-10 ordered steps: final trichome check, tool prep/sanitation, harvest technique (whole plant vs. branch by branch), fan leaf removal, wet vs. dry trim decision, drying setup with target temp/RH, what the remaining strain(s) need today"],
      "notes": "Drying duration target and curing overview."
    }
  },
  "threats": [
    { "id": "unique_id", "icon": "emoji", "title": "short title", "desc": "2-3 sentence description specific to this grow's location, season, and environment", "phases": ["phase_key_1", "phase_key_2"] }
  ]
}

For grows with TWO strains, also include these keys inside "phases":
  "flower_haze": { "summary": "...", "tasks": ["6-7 tasks: secondary strain late flower while primary has been harvested"], "notes": "..." },
  "flush_haze": { "summary": "...", "tasks": ["6-7 tasks"], "notes": "..." },
  "harvest_haze": { "title": "HARVEST — [Secondary strain name]", "summary": "...", "tasks": ["8-10 ordered steps"], "notes": "Curing notes." }

QUALITY REQUIREMENTS:
- Use the grower's exact strain names and product names throughout all tasks
- Nutrient doses must match their specific brand and products (never use a brand they didn't mention)
- Container lifting for moisture checks must reference their container size
- Outdoor grows: reference their location's climate, seasons, and weather risks
- Indoor grows: reference their tent size, lighting schedule, and HVAC
- Tasks must be numbered sentences (no bullets), 1-3 sentences each, direct and specific
- 4-6 threats minimum, each with ≥2 phases listed and specific to their environment`;
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fillMissingConfigKeys(config, survey) {
  const base = config.transplant || survey.transplantDate;
  if (!config.start)       config.start       = addDays(base, -2);
  if (!config.calMag)      config.calMag      = addDays(base, 14);
  if (!config.feedStart)   config.feedStart   = addDays(base, 28);
  if (!config.fullDose)    config.fullDose    = addDays(base, 42);
  if (!config.flush1)      config.flush1      = addDays(base, 31);
  if (!config.flush2)      config.flush2      = addDays(base, 61);
  if (!config.flush3)      config.flush3      = addDays(base, 91);
  if (!config.backyardMove) config.backyardMove = addDays(base, 64);
  if (!config.preFlower)   config.preFlower   = addDays(base, 69);
  if (!config.flowerStart) config.flowerStart = addDays(base, 83);
  if (!config.gdpFlush)    config.gdpFlush    = addDays(base, 114);
  if (!config.gdpHarvest)  config.gdpHarvest  = addDays(base, 121);
  if (!config.hazeFlush)   config.hazeFlush   = config.gdpFlush;
  if (!config.hazeHarvest) config.hazeHarvest = config.gdpHarvest;
}

export function extractJson(text) {
  // Strip markdown code fences if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Find the first { and last } to extract the JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);
  return text.trim();
}

export async function postPlanSetup(request, env, user) {
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
    const headers = { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" };
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
      logError("plan-setup-gemini-error", { status: res.status, detail: detail.slice(0, 500) });
      return error(502, "AI generation failed. Please try again.");
    }

    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  } catch (err) {
    logError("plan-setup-fetch-error", { message: String(err?.message) });
    return error(502, "Could not reach AI service. Please try again.");
  }

  let generatedPlan;
  try {
    generatedPlan = JSON.parse(extractJson(rawText));
  } catch {
    logError("plan-setup-json-parse", { raw: rawText.slice(0, 800) });
    return error(502, "AI returned an unparseable plan. Please try again.");
  }

  const config = generatedPlan?.config;
  if (!config || typeof config !== "object") {
    return error(502, "AI did not produce a valid config. Please try again.");
  }

  // Backfill any keys the AI missed.
  fillMissingConfigKeys(config, survey);

  // Final check: all required keys present.
  const missing = REQUIRED_CONFIG_KEYS.filter(k => !config[k]);
  if (missing.length > 0) {
    logError("plan-setup-missing-keys", { missing, config });
    return error(502, "Generated plan is incomplete. Please try again.");
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO plan_config (user_id, config, survey, generated_plan, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       config = excluded.config,
       survey = excluded.survey,
       generated_plan = excluded.generated_plan,
       updated_at = excluded.updated_at`,
  ).bind(
    user.id,
    JSON.stringify(config),
    JSON.stringify(survey),
    JSON.stringify(generatedPlan),
    now,
  ).run();

  return json({ ok: true, config, generatedPlan });
}

// POST /api/plan/regenerate — re-run AI with the stored survey (dates unchanged).
// Overwrites generated_plan but leaves phase_overrides intact.
export async function postPlanRegenerate(request, env, user) {
  const row = await env.DB.prepare(
    "SELECT survey FROM plan_config WHERE user_id = ?"
  ).bind(user.id).first();

  if (!row?.survey) return error(400, "no survey on file — complete initial setup first");

  let survey;
  try { survey = JSON.parse(row.survey); }
  catch { return error(500, "stored survey is corrupt — re-run full setup"); }

  const prompt = buildSetupPrompt(survey);
  let rawText = "";
  try {
    const base = geminiBase(env.CF_AI_GATEWAY_URL ?? null);
    const headers = { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" };
    if (user?.id != null) headers["cf-aig-metadata"] = JSON.stringify({ user_id: String(user.id) });
    const res = await fetch(`${base}/${SETUP_MODEL}:generateContent`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 8000 } },
      }),
    });
    if (res.status === 429) return error(429, "AI quota reached. Please try again in a few minutes.");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logError("plan-regen-gemini-error", { status: res.status, detail: detail.slice(0, 500) });
      return error(502, "AI generation failed. Please try again.");
    }
    const data = await res.json();
    rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  } catch (err) {
    logError("plan-regen-fetch-error", { message: String(err?.message) });
    return error(502, "Could not reach AI service. Please try again.");
  }

  let generatedPlan;
  try { generatedPlan = JSON.parse(extractJson(rawText)); }
  catch {
    logError("plan-regen-json-parse", { raw: rawText.slice(0, 800) });
    return error(502, "AI returned an unparseable plan. Please try again.");
  }

  // Only update generated_plan — leave config and phase_overrides as-is.
  await env.DB.prepare(
    "UPDATE plan_config SET generated_plan = ?, updated_at = ? WHERE user_id = ?"
  ).bind(JSON.stringify(generatedPlan), new Date().toISOString(), user.id).run();

  return json({ ok: true, generatedPlan });
}
