// @ts-check
// Grow-timeline derivation (fillMissingConfigKeys) plus the AI usage caps
// shared with the MJ plan review (mjReview.js). Plan GENERATION itself is
// heuristic now (src/lib/heuristicPlan.js via grows.js) - the old Gemini
// plan-generation path was removed.
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";
import { GEMINI_PRO_DAILY_LIMIT, PLAN_GEN_DAILY_CAP } from "./limits.js";

// Model whose shared free-tier budget the caps below account against.
export const SETUP_MODEL = "gemini-2.5-pro";

export const REQUIRED_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fillMissingConfigKeys(config, survey) {
  const base = config.transplant || survey.transplantDate;
  if (!config.start)       config.start       = addDays(base, -2);
  // Germination + seedling windows live before transplant, but only for grows
  // that actually start from seed/seedling. Clone/veg starts have no such window,
  // so collapse them onto `start` (getPhase then emits no germination/seedling
  // days, identical to grows created before these keys existed).
  const seedStart = survey?.startType === "seed"
    || ["germination", "seedling"].includes(survey?.currentStage);
  if (seedStart) {
    if (!config.seedlingStart) config.seedlingStart = addDays(base, -14);
    if (!config.germinate)     config.germinate     = addDays(base, -19);
  } else {
    config.seedlingStart = config.start;
    config.germinate     = config.start;
  }
  if (!config.calMag)      config.calMag      = addDays(base, 14);
  if (!config.feedStart)   config.feedStart   = addDays(base, 28);
  if (!config.fullDose)    config.fullDose    = addDays(base, 42);
  if (!config.flush1)      config.flush1      = addDays(base, 31);
  if (!config.flush2)      config.flush2      = addDays(base, 61);
  if (!config.flush3)      config.flush3      = addDays(base, 91);
  // A "move outside" milestone only applies to outdoor grows whose plants start
  // indoors and get relocated to their final spot later. Indoor/greenhouse grows
  // - and outdoor grows whose plants are already in place - have no such step, so
  // collapse backyardMove onto transplant. milestones.js hides the milestone when
  // backyardMove === transplant. This is authoritative: it overrides any move date
  // the AI may have invented, so the event can't reappear for these grows.
  const hasMoveOutside = survey.environment === "outdoor" && !survey.plantsAlreadyOutside;
  if (hasMoveOutside) {
    if (!config.backyardMove) config.backyardMove = addDays(base, 64);
  } else {
    config.backyardMove = base;
  }
  // Veg length to pre-flower depends on the setup. Autos flower on age at about
  // four weeks. Outdoor photoperiod flips with the season in late summer (about
  // ten weeks). Indoor and greenhouse photoperiod flip when the grower chooses,
  // so use their planned veg weeks. Harvest is then set by each strain's flower
  // length: the earliest finisher drives gdp, the latest drives haze (a single
  // strain, or several with the same flower time, collapses to one harvest).
  const strains = Array.isArray(survey.strains) ? survey.strains : [];
  const allAuto = strains.length > 0 && strains.every(s => s.photo === false);
  const fwList = strains.map(s => Number(s.flowerWeeks)).filter(n => Number.isFinite(n) && n > 0);
  const minFw = fwList.length ? Math.min(...fwList) : 9;
  const maxFw = fwList.length ? Math.max(...fwList) : 9;
  const primaryType = strains[0]?.type;
  const flushLead = primaryType === "sativa" ? 14 : primaryType === "indica" ? 7 : 10;

  let vegDays;
  if (allAuto) vegDays = 28;
  else if (survey.environment === "outdoor") vegDays = 69;
  else vegDays = Math.max(14, (Number(survey.vegWeeks) || 4) * 7);

  if (!config.preFlower)   config.preFlower   = addDays(base, vegDays);
  if (!config.flowerStart) config.flowerStart = addDays(config.preFlower, allAuto ? 10 : 14);
  if (!config.gdpHarvest)  config.gdpHarvest  = addDays(config.flowerStart, minFw * 7);
  if (!config.gdpFlush)    config.gdpFlush    = addDays(config.gdpHarvest, -flushLead);
  if (!config.hazeHarvest) config.hazeHarvest = addDays(config.flowerStart, maxFw * 7);
  if (!config.hazeFlush)   config.hazeFlush   = addDays(config.hazeHarvest, -flushLead);
}

// ── AI usage caps (shared with mjReview.js) ────────────────────────────────
// Per-user daily cap plus a global gemini-2.5-pro budget shared with the MJ
// chat (via the mj_model_usage table) so total pro calls stay inside the
// Gemini free tier.

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

let _planUsageReady = false;
async function ensurePlanUsageSchema(env) {
  if (_planUsageReady) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS plan_gen_usage (
         user_id INTEGER NOT NULL,
         date    TEXT NOT NULL,
         count   INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (user_id, date)
       )`,
    ).run();
  } catch { /* already exists */ }
  _planUsageReady = true;
}

// Returns null if generation may proceed, or { status, message } if a cap is hit.
export async function checkPlanGenCaps(env, userId) {
  await ensurePlanUsageSchema(env);
  const today = todayInET();

  const proRow = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM mj_model_usage WHERE model = ? AND date = ?",
  ).bind(SETUP_MODEL, today).first();
  if (Number(proRow?.count ?? 0) >= GEMINI_PRO_DAILY_LIMIT) {
    return { status: 429, message: "The shared daily AI plan-generation limit has been reached. Please try again after midnight ET." };
  }

  const userRow = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM plan_gen_usage WHERE user_id = ? AND date = ?",
  ).bind(userId, today).first();
  if (Number(userRow?.count ?? 0) >= PLAN_GEN_DAILY_CAP) {
    return { status: 429, message: `You've used all ${PLAN_GEN_DAILY_CAP} plan generations for today. They reset at midnight ET.` };
  }

  return null;
}

export async function bumpPlanGenUsage(env, userId) {
  const today = todayInET();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO plan_gen_usage (user_id, date, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1",
    ).bind(userId, today),
    env.DB.prepare(
      "INSERT INTO mj_model_usage (model, date, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(model, date) DO UPDATE SET count = count + 1",
    ).bind(SETUP_MODEL, today),
  ]);
}

