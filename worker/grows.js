// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import { geocode } from "./geocode.js";
import {
  fillMissingConfigKeys,
  REQUIRED_CONFIG_KEYS,
} from "./planSetup.js";
import { ensurePlantIds, backfillStrainsFromPlan } from "./plantsRoster.js";
import { validateEventRule, MAX_RULES_PER_GROW } from "./eventRulesValidate.js";
import { LIFECYCLE_PHASES } from "../src/lib/lifecycle.js";
import { recordStrains } from "./strains.js";
import { buildHeuristicPlan } from "../src/lib/heuristicPlan.js";

const VALID_PHASES = new Set([
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function newGrowId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Auto-migrate plan_config → grows table if user has no grows yet.
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

// Returns raw grow data without a Response wrapper - for internal use by other handlers.
export async function loadRawGrow(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT * FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;

  const overridesRes = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ? AND grow_id = ?"
  ).bind(userId, growId).all();
  const overrides = {};
  for (const r of overridesRes.results ?? []) {
    try { overrides[r.date] = JSON.parse(r.payload); } catch { /* skip */ }
  }

  return {
    config:        parseField(row.config),
    overrides,
    generatedPlan: parseField(row.generated_plan),
    phaseOverrides: parseField(row.phase_overrides) ?? {},
    eventRules:     parseField(row.event_rules) ?? [],
    survey:        parseField(row.survey),
    lifecycle:     parseField(row.lifecycle),
    needsSetup:    !row.config,
    displayName:   row.display_name,
    status:        row.status,
    id:            row.id,
  };
}

// Returns the grows list as plain objects (for internal use by mj.js).
export async function loadRawGrows(env, userId) {
  await ensureMigrated(env, userId);
  const res = await env.DB.prepare(
    `SELECT id, display_name, status, config, survey, generated_plan, lifecycle, created_at
     FROM grows WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(userId).all();
  return (res.results ?? []).map(r => ({
    id:            r.id,
    displayName:   r.display_name,
    status:        r.status,
    config:        parseField(r.config),
    survey:        parseField(r.survey),
    generatedPlan: parseField(r.generated_plan),
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
      `SELECT id, display_name, status, config, survey, generated_plan, created_at, updated_at
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

  const overridesRes = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ? AND grow_id = ?"
  ).bind(user.id, growId).all();

  const overrides = {};
  for (const r of overridesRes.results ?? []) {
    try { overrides[r.date] = JSON.parse(r.payload); } catch { /* skip corrupt override */ }
  }

  const config        = parseField(row.config);
  const generatedPlan = parseField(row.generated_plan);
  const phaseOverrides = parseField(row.phase_overrides) ?? {};
  const eventRules = parseField(row.event_rules) ?? [];
  let survey = parseField(row.survey);
  let surveyChanged = false;

  // Seed the per-plant roster from the AI plan's strains if it has none yet, so
  // the Plants section never lags behind the calendar/garden.
  const back = backfillStrainsFromPlan(survey, generatedPlan);
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
    config,
    overrides,
    generatedPlan,
    phaseOverrides,
    eventRules,
    survey,
    lifecycle:    parseField(row.lifecycle),
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
  return json({ ok: true });
}

// POST /api/grows/:id/setup - AI-generate plan for a specific grow
export async function setupGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const survey = body?.survey;
  if (!survey || typeof survey !== "object") return error(400, "survey required");
  if (!survey.transplantDate) return error(400, "survey.transplantDate required");
  if (!Array.isArray(survey.strains) || survey.strains.length === 0)
    return error(400, "survey.strains required");

  // The whole timeline is built from the survey with no AI call (no quota, no
  // failures). Manual mode stores a sentinel so getDetail renders no auto tasks;
  // any other mode gets a heuristic, environment-aware task rundown.
  const config = {};
  fillMissingConfigKeys(config, survey);
  const missing = REQUIRED_CONFIG_KEYS.filter(k => !config[k]);
  if (missing.length > 0) {
    logError("grows-setup-missing-keys", { missing });
    return error(500, "Could not build the calendar timeline. Check your transplant date.");
  }

  // Resolve coordinates for weather/frost if the GPS button didn't already
  // provide them. Best-effort; a failure just means no weather until it's set.
  if ((survey.lat == null || survey.lon == null) && survey.location) {
    const geo = await geocode(survey.location);
    if (geo) { survey.lat = geo.lat; survey.lon = geo.lon; }
  }

  const generatedPlan = body.taskMode === "manual" ? { manual: true } : buildHeuristicPlan(survey);
  const displayName = survey.growName || "My Grow";
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

  await recordStrains(env, survey.strains);
  return json({ ok: true, config, generatedPlan, displayName });
}

// POST /api/grows/:id/regenerate - rebuild the heuristic task plan from the
// stored survey (no AI). Leaves config and phase overrides as they are.
export async function regenerateGrow(request, env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");
  if (!row.survey) return error(400, "no survey on file, complete initial setup first");

  let survey;
  try { survey = JSON.parse(row.survey); }
  catch { return error(500, "stored survey is corrupt, re-run full setup"); }

  const generatedPlan = buildHeuristicPlan(survey);

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
  { const p = await safeJsonBounded(request, 65536); if (!p.ok) return error(p.status, p.error); body = p.data; }

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

function newRuleId() {
  return "evt_" + Math.random().toString(36).slice(2, 10);
}

async function readGrowRules(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT event_rules FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;
  return parseField(row.event_rules) ?? [];
}

async function writeGrowRules(env, userId, growId, rules) {
  await env.DB.prepare(
    "UPDATE grows SET event_rules = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(rules), new Date().toISOString(), growId, userId).run();
}

// POST /api/grows/:id/events
export async function createGrowEvent(request, env, user, growId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  if (rules.length >= MAX_RULES_PER_GROW) return error(400, `rule limit (${MAX_RULES_PER_GROW}) reached`);

  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const rule = {
    id: newRuleId(),
    label: typeof body?.label === "string" ? body.label.slice(0, 80) : "",
    task: typeof body?.task === "string" ? body.task : "",
    enabled: body?.enabled !== false,
    window: body?.window ?? null,
    cadence: body?.cadence ?? null,
    createdAt: new Date().toISOString(),
  };

  const invalid = validateEventRule(rule);
  if (invalid) return error(400, invalid);

  rules.push(rule);
  await writeGrowRules(env, user.id, growId, rules);
  return json({ ok: true, rule });
}

// PATCH /api/grows/:id/events/:ruleId
export async function patchGrowEvent(request, env, user, growId, ruleId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx < 0) return error(404, "rule not found");

  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const next = { ...rules[idx] };
  if (typeof body?.label === "string") next.label = body.label.slice(0, 80);
  if (typeof body?.task === "string") next.task = body.task;
  if (typeof body?.enabled === "boolean") next.enabled = body.enabled;
  if (body?.window !== undefined) next.window = body.window;
  if (body?.cadence !== undefined) next.cadence = body.cadence;

  const invalid = validateEventRule(next);
  if (invalid) return error(400, invalid);

  rules[idx] = next;
  await writeGrowRules(env, user.id, growId, rules);
  return json({ ok: true, rule: next });
}

// DELETE /api/grows/:id/events/:ruleId
export async function deleteGrowEvent(env, user, growId, ruleId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  await writeGrowRules(env, user.id, growId, rules.filter(r => r.id !== ruleId));
  return json({ ok: true });
}

// PATCH /api/grows/:id/day/:date - merge editedTasks into plan_day_overrides for one day
export async function patchGrowDayOverride(request, env, user, growId, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date");

  const growRow = await env.DB.prepare(
    "SELECT id FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, user.id).first();
  if (!growRow) return error(404, "grow not found");

  const parsed = await safeJsonBounded(request, 8192);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const { editedTasks } = parsed.data ?? {};
  if (!editedTasks || typeof editedTasks !== "object" || Array.isArray(editedTasks)) {
    return error(400, "editedTasks must be an object mapping index → text");
  }

  const existing = await env.DB.prepare(
    "SELECT payload FROM plan_day_overrides WHERE user_id = ? AND grow_id = ? AND date = ?"
  ).bind(user.id, growId, date).first();

  let payload = {};
  if (existing?.payload) {
    try { payload = JSON.parse(existing.payload); } catch { /* start fresh */ }
  }

  const merged = { ...(payload.editedTasks ?? {}), ...editedTasks };
  for (const k of Object.keys(merged)) {
    if (merged[k] === null || merged[k] === "") delete merged[k];
  }
  if (Object.keys(merged).length > 0) payload.editedTasks = merged;
  else delete payload.editedTasks;

  await env.DB.prepare(
    `INSERT INTO plan_day_overrides (user_id, grow_id, date, payload, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, grow_id, date) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).bind(user.id, growId, date, JSON.stringify(payload)).run();

  return json({ ok: true });
}
