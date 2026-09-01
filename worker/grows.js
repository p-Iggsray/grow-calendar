// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import { geocode } from "./geocode.js";
import { ensurePlantIds, backfillStrainsFromPlan } from "./plantsRoster.js";
import { LIFECYCLE_PHASES } from "../src/lib/lifecycle.js";
import { recordStrains } from "./strains.js";
import { seedStageEntries } from "./plants.js";
import { resolveSurveyForSetup } from "../src/lib/stageAnchor.js";
import { growAnchor } from "../src/lib/stageTimeline.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The editable "what is this space" fields of an environment. Everything here
// is merged into the survey by PATCH /api/grows/:id; unknown keys are ignored
// so a stale client can never write junk into the survey.
const ENV_TEXT_FIELDS = {
  envSize: 40,          // "4x4 tent", "raised bed"
  lightSchedule: 20,    // "18/6"
  lightType: 40,        // "LED quantum board"
  medium: 40,
  wateringMethod: 40,
  containerType: 40,
};
const ENV_NUM_FIELDS = {
  envCapacity: [0, 500],
  lightWatts: [0, 100000],
  containerGallons: [0, 1000],
};
const ENV_KINDS = new Set(["indoor", "outdoor", "greenhouse"]);

// Pure: pick the valid environment fields out of a patch body. Returns only
// the keys actually supplied, clamped and trimmed.
export function sanitizeEnvFields(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;

  if (typeof input.environment === "string" && ENV_KINDS.has(input.environment)) {
    out.environment = input.environment;
  }
  for (const [key, max] of Object.entries(ENV_TEXT_FIELDS)) {
    if (typeof input[key] === "string") out[key] = input[key].trim().slice(0, max);
  }
  for (const [key, [lo, hi]] of Object.entries(ENV_NUM_FIELDS)) {
    if (input[key] === null || input[key] === "") { out[key] = null; continue; }
    if (input[key] === undefined) continue;
    const n = Number(input[key]);
    if (Number.isFinite(n)) out[key] = Math.max(lo, Math.min(hi, n));
  }
  return out;
}

function newGrowId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Auto-migrate the legacy single-grow plan_config row into the grows table if
// the user has no grows yet. Only the survey carries over: the old config was a
// table of predicted dates, and the calendar is built from recorded stage
// switches now.
async function ensureMigrated(env, userId) {
  // Try to create the grows table via prepare().run() - more reliable than exec() for DDL.
  // Both calls are wrapped individually; CREATE INDEX may legitimately fail if it already exists.
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS grows (
        id              TEXT PRIMARY KEY,
        user_id         INTEGER NOT NULL,
        display_name    TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active','harvested','abandoned')),
        config          TEXT,
        survey          TEXT,
        generated_plan  TEXT,
        phase_overrides TEXT,
        event_rules     TEXT,
        lifecycle       TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      )`
    ).run();
  } catch (e) {
    logError("grows-ddl-create-table", { message: String(e?.message) });
    // If table creation failed, nothing below can succeed - bail out.
    return;
  }
  try {
    await env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS idx_grows_user_id ON grows(user_id, created_at DESC)`
    ).run();
  } catch { /* index may already exist */ }
  // Backfill the post-harvest lifecycle column on grows tables created before it
  // existed (no-op on a freshly-created table above).
  try {
    await env.DB.prepare(`ALTER TABLE grows ADD COLUMN lifecycle TEXT`).run();
  } catch { /* column already exists */ }

  const existing = await env.DB.prepare(
    "SELECT id FROM grows WHERE user_id = ? LIMIT 1"
  ).bind(userId).first();
  if (existing) return;

  const planRow = await env.DB.prepare(
    "SELECT * FROM plan_config WHERE user_id = ?"
  ).bind(userId).first();
  if (!planRow?.survey) return;

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
      (id, user_id, display_name, status, survey, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).bind(
    id, userId, displayName,
    planRow.survey,
    planRow.updated_at || now,
    now,
  ).run();
}

function parseField(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Returns raw grow data without a Response wrapper - for internal use by other handlers.
export async function loadRawGrow(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT * FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;

  return {
    survey:        parseField(row.survey),
    lifecycle:     parseField(row.lifecycle),
    needsSetup:    !row.survey,
    displayName:   row.display_name,
    status:        row.status,
    id:            row.id,
  };
}

// Returns the grows list as plain objects (for internal use by mj.js).
export async function loadRawGrows(env, userId) {
  await ensureMigrated(env, userId);
  const res = await env.DB.prepare(
    `SELECT id, display_name, status, survey, lifecycle, created_at
     FROM grows WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(userId).all();
  return (res.results ?? []).map(r => ({
    id:            r.id,
    displayName:   r.display_name,
    status:        r.status,
    survey:        parseField(r.survey),
    lifecycle:     parseField(r.lifecycle),
    createdAt:     r.created_at,
  }));
}

// GET /api/grows
export async function listGrows(env, user) {
  await ensureMigrated(env, user.id);

  let res;
  try {
    res = await env.DB.prepare(
      `SELECT id, display_name, status, survey, created_at, updated_at
       FROM grows WHERE user_id = ? ORDER BY created_at DESC`
    ).bind(user.id).all();
  } catch (e) {
    // Table still doesn't exist (ensureMigrated bailed out). Return empty list
    // so the app shows the setup wizard instead of a hard error.
    logError("grows-list-query", { message: String(e?.message) });
    return json([]);
  }

  return json((res.results ?? []).map(r => ({
    id:            r.id,
    displayName:   r.display_name,
    status:        r.status,
    survey:        parseField(r.survey),
    // Day 0 is the day the space was created - no query needed for it.
    firstDate:     growAnchor(r.created_at),
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  })));
}

// POST /api/grows
export async function createGrow(request, env, user) {
  let body = {};
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

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

  let survey = parseField(row.survey);
  let surveyChanged = false;

  // Legacy back-compat: old grows stored their strain roster only on the
  // generated plan - seed the survey from it once so Plants never lags.
  const back = backfillStrainsFromPlan(survey, parseField(row.generated_plan));
  if (back.changed) { survey = back.survey; surveyChanged = true; }

  if (survey) {
    const ensured = ensurePlantIds(survey);
    if (ensured.changed) { survey = ensured.survey; surveyChanged = true; }
  }

  if (surveyChanged) {
    await env.DB.prepare(
      "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(JSON.stringify(survey), new Date().toISOString(), row.id, user.id).run();
  }

  return json({
    id:           row.id,
    displayName:  row.display_name,
    status:       row.status,
    survey,
    lifecycle:    parseField(row.lifecycle),
    needsSetup:   !survey,
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
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

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

  // Location and the environment's own setup fields both merge into the survey
  // JSON. Location feeds auto weather and frost data; the env fields describe
  // the space itself (type, size, lighting, medium, watering).
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const hasCoords = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
  const envFields = sanitizeEnvFields(body.environmentSetup);
  const hasEnvFields = Object.keys(envFields).length > 0;
  if (typeof body.location === "string" || hasCoords || hasEnvFields) {
    const srow = await env.DB.prepare(
      "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
    ).bind(growId, user.id).first();
    let survey = {};
    try { survey = srow?.survey ? JSON.parse(srow.survey) : {}; } catch { survey = {}; }
    if (typeof body.location === "string") {
      survey.location = body.location.trim().slice(0, 120);
      // A new typed place invalidates old coordinates unless fresh ones came along.
      if (!hasCoords) { delete survey.lat; delete survey.lon; }
    }
    if (hasCoords) { survey.lat = lat; survey.lon = lon; }
    if (hasEnvFields) Object.assign(survey, envFields);
    fields.push("survey = ?");
    binds.push(JSON.stringify(survey));
  }

  if (fields.length === 0) return json({ ok: true });

  fields.push("updated_at = ?");
  binds.push(new Date().toISOString(), growId, user.id);

  await env.DB.prepare(
    `UPDATE grows SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
  ).bind(...binds).run();

  return json({ ok: true });
}

// ── Lifecycle (post-harvest drying/curing/done) ──────────────────────────────
const MAX_LIFECYCLE_LOGS = 120;

function clampNum(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}
function clampStr(v, max) {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}
function validDateOrNull(v) {
  return typeof v === "string" && DATE_RE.test(v) ? v : null;
}

// Belt-and-suspenders validation of a full lifecycle object before it's stored
// (same style as validatePlantFields): unknown/oversized data is dropped, not
// trusted. Returns { ok, value } or { ok:false, error }.
export function validateLifecycle(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "lifecycle object required" };
  if (!LIFECYCLE_PHASES.has(input.phase)) return { ok: false, error: "invalid phase" };

  const checklist = {};
  if (input.dryChecklist && typeof input.dryChecklist === "object") {
    for (const [k, v] of Object.entries(input.dryChecklist).slice(0, 20)) {
      checklist[clampStr(k, 40)] = v === true;
    }
  }

  const dryLogs = (Array.isArray(input.dryLogs) ? input.dryLogs : [])
    .slice(-MAX_LIFECYCLE_LOGS)
    .map(e => ({
      date: validDateOrNull(e?.date),
      tempF: clampNum(e?.tempF, -20, 200),
      rh: clampNum(e?.rh, 0, 100),
      note: clampStr(e?.note, 500),
    }))
    .filter(e => e.date);

  const cureLogs = (Array.isArray(input.cureLogs) ? input.cureLogs : [])
    .slice(-MAX_LIFECYCLE_LOGS)
    .map(e => ({
      date: validDateOrNull(e?.date),
      rh: clampNum(e?.rh, 0, 100),
      burped: e?.burped === true,
      note: clampStr(e?.note, 500),
    }))
    .filter(e => e.date);

  return {
    ok: true,
    value: {
      phase: input.phase,
      dryStartedAt: validDateOrNull(input.dryStartedAt),
      cureStartedAt: validDateOrNull(input.cureStartedAt),
      finishedAt: validDateOrNull(input.finishedAt),
      dryChecklist: checklist,
      dryLogs,
      cureLogs,
      finalWeightG: clampNum(input.finalWeightG, 0, 1000000),
      finalNotes: clampStr(input.finalNotes, 2000),
    },
  };
}

// PATCH /api/grows/:id/lifecycle - full-replace write of the validated lifecycle.
export async function patchGrowLifecycle(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 131072); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = validateLifecycle(body?.lifecycle);
  if (!v.ok) return error(400, v.error);

  // Make sure the column exists on older grows tables before writing to it.
  try { await env.DB.prepare(`ALTER TABLE grows ADD COLUMN lifecycle TEXT`).run(); } catch { /* exists */ }

  const now = new Date().toISOString();
  // Finishing the grow also flips its top-level status so cards/badges reflect it.
  if (v.value.phase === "done") {
    await env.DB.prepare(
      "UPDATE grows SET lifecycle = ?, status = 'harvested', updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(JSON.stringify(v.value), now, growId, user.id).run();
  } else {
    await env.DB.prepare(
      "UPDATE grows SET lifecycle = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).bind(JSON.stringify(v.value), now, growId, user.id).run();
  }

  return json({ ok: true, lifecycle: v.value });
}

// DELETE /api/grows/:id
export async function deleteGrow(env, user, growId) {
  await env.DB.prepare(
    "DELETE FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).run();
  // Calendar events belong to the grow; clean them up with it.
  try {
    await env.DB.prepare(
      "DELETE FROM grow_events WHERE grow_id = ? AND user_id = ?"
    ).bind(growId, user.id).run();
  } catch { /* table may not exist yet */ }
  return json({ ok: true });
}

// POST /api/grows/:id/setup - finish setting up an environment from the wizard
// survey. There are no dates to compute: the calendar is written later, as the
// grower moves plants from one stage to the next.
export async function setupGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

  let survey = body?.survey;
  if (!survey || typeof survey !== "object") return error(400, "survey required");

  // Expand the strain list into one roster entry per plant and tag each with
  // the stage the grower says they are in. Done SERVER-SIDE so any client
  // version - including a stale cached PWA bundle - produces a valid roster.
  survey = ensurePlantIds(resolveSurveyForSetup(survey)).survey;
  if (!Array.isArray(survey.strains) || survey.strains.length === 0)
    return error(400, "Add at least one strain before finishing setup.");

  // Resolve coordinates for weather/frost if the GPS button didn't already
  // provide them. Best-effort; a failure just means no weather until it's set.
  if ((survey.lat == null || survey.lon == null) && survey.location) {
    const geo = await geocode(survey.location);
    if (geo) { survey.lat = geo.lat; survey.lon = geo.lon; }
  }

  const displayName = (survey.growName || "").trim()
    || [survey.strains?.[0]?.name, String(new Date().getFullYear())].filter(Boolean).join(" ").trim()
    || "My Grow";
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE grows
     SET display_name = ?, survey = ?, generated_plan = NULL, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    displayName,
    JSON.stringify(survey),
    now,
    growId,
    user.id,
  ).run();

  // Day 0 of this space is today, the day it was created. Seeding one stage
  // entry per plant is what makes the calendar light up immediately instead of
  // staying blank until the next stage change.
  await seedStageEntries(env, user.id, growId, survey);

  await recordStrains(env, survey.strains);
  return json({ ok: true, displayName });
}
