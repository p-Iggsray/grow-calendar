// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey, normalizeLogEntry,
} from "./plantsRoster.js";

function parseSurvey(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function ownedGrowRow(env, userId, growId) {
  return env.DB.prepare(
    "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
}

async function saveSurvey(env, userId, growId, survey) {
  await env.DB.prepare(
    "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(survey), new Date().toISOString(), growId, userId).run();
}

let _schemaReady = false;
export async function ensurePlantLogSchema(env) {
  if (_schemaReady) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS plant_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        grow_id     TEXT NOT NULL,
        plant_id    TEXT NOT NULL,
        date        TEXT NOT NULL,
        kind        TEXT,
        detail      TEXT,
        body        TEXT NOT NULL DEFAULT '',
        height      REAL,
        height_unit TEXT,
        health      TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`
    ).run();
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_plant_log ON plant_log(user_id, grow_id, plant_id, date DESC)"
    ).run();
    // Categorize-history columns (added later); ALTER for tables created earlier.
    for (const sql of [
      "ALTER TABLE plant_log ADD COLUMN kind TEXT",
      "ALTER TABLE plant_log ADD COLUMN detail TEXT",
    ]) {
      try { await env.DB.prepare(sql).run(); } catch { /* column already exists */ }
    }
    _schemaReady = true;
  } catch (e) {
    logError("plant-log-ddl", { message: String(e?.message) });
  }
}

// POST /api/grows/:id/plants
export async function addPlant(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = validatePlantFields(body ?? {}, false);
  if (!v.ok) return error(400, v.error);

  const survey = parseSurvey(row.survey) ?? {};
  const { survey: nextSurvey, plant } = addPlantToSurvey(survey, v.value);
  await saveSurvey(env, user.id, growId, nextSurvey);
  return json({ ok: true, plant });
}

// PATCH /api/grows/:id/plants/:plantId
export async function patchPlant(request, env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = validatePlantFields(body ?? {}, true);
  if (!v.ok) return error(400, v.error);
  if (Object.keys(v.value).length === 0) return error(400, "no valid fields");

  const ensured = ensurePlantIds(parseSurvey(row.survey) ?? {});
  const res = updatePlantInSurvey(ensured.survey, plantId, v.value);
  if (!res) return error(404, "plant not found");

  await saveSurvey(env, user.id, growId, res.survey);
  return json({ ok: true, plant: res.plant });
}

// DELETE /api/grows/:id/plants/:plantId
export async function deletePlant(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  const res = removePlantFromSurvey(parseSurvey(row.survey) ?? {}, plantId);
  if (!res) return error(404, "plant not found");

  await ensurePlantLogSchema(env);
  await saveSurvey(env, user.id, growId, res.survey);
  await env.DB.prepare(
    "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ?"
  ).bind(user.id, growId, plantId).run();
  return json({ ok: true });
}

export { ownedGrowRow, parseSurvey, saveSurvey };

// GET /api/grows/:id/plants/:plantId/log
export async function listPlantLog(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT id, date, kind, detail, body, height, height_unit, health, created_at, updated_at
     FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ?
     ORDER BY date DESC, id DESC`
  ).bind(user.id, growId, plantId).all();
  const entries = (res.results ?? []).map((r) => {
    let detail = null;
    if (r.detail) { try { detail = JSON.parse(r.detail); } catch { detail = null; } }
    return { ...r, kind: r.kind || "note", detail };
  });
  return json({ entries });
}

// POST /api/grows/:id/plants/:plantId/log
export async function addPlantLogEntry(request, env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const survey = parseSurvey(row.survey);
  const exists = Array.isArray(survey?.strains) && survey.strains.some((s) => s.id === plantId);
  if (!exists) return error(404, "plant not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const todayIso = new Date().toISOString().slice(0, 10);
  const v = normalizeLogEntry(body ?? {}, false, todayIso);
  if (!v.ok) return error(400, v.error);

  await ensurePlantLogSchema(env);
  const now = new Date().toISOString();
  const ins = await env.DB.prepare(
    `INSERT INTO plant_log
       (user_id, grow_id, plant_id, date, kind, detail, body, height, height_unit, health, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, growId, plantId,
    v.value.date, v.value.kind ?? "note", v.value.detail ?? null, v.value.body ?? "",
    v.value.height ?? null, v.value.height_unit ?? null, v.value.health ?? null,
    now, now,
  ).run();
  return json({ ok: true, id: ins.meta.last_row_id });
}

// PATCH /api/grows/:id/plants/:plantId/log/:entryId
export async function patchPlantLogEntry(request, env, user, growId, plantId, entryId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = normalizeLogEntry(body ?? {}, true);
  if (!v.ok) return error(400, v.error);
  const cols = Object.keys(v.value); // safe: fixed set from the normalizer
  if (cols.length === 0) return error(400, "no valid fields");

  await ensurePlantLogSchema(env);
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const binds = cols.map((c) => v.value[c]);
  binds.push(new Date().toISOString(), user.id, growId, plantId, entryId);
  const upd = await env.DB.prepare(
    `UPDATE plant_log SET ${sets}, updated_at = ?
     WHERE user_id = ? AND grow_id = ? AND plant_id = ? AND id = ?`
  ).bind(...binds).run();
  if (!upd.meta.changes) return error(404, "entry not found");
  return json({ ok: true });
}

// DELETE /api/grows/:id/plants/:plantId/log/:entryId
export async function deletePlantLogEntry(env, user, growId, plantId, entryId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const del = await env.DB.prepare(
    "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ? AND id = ?"
  ).bind(user.id, growId, plantId, entryId).run();
  if (!del.meta.changes) return error(404, "entry not found");
  return json({ ok: true });
}

// GET /api/grows/:id/plant-log-summary -- latest metric row per plant in one query.
export async function plantLogSummary(env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT plant_id, date, height, height_unit, health FROM (
       SELECT plant_id, date, height, height_unit, health,
              ROW_NUMBER() OVER (PARTITION BY plant_id ORDER BY date DESC, id DESC) AS rn
       FROM plant_log WHERE user_id = ? AND grow_id = ?
     ) WHERE rn = 1`
  ).bind(user.id, growId).all();
  const summary = {};
  for (const r of res.results ?? []) {
    summary[r.plant_id] = { date: r.date, height: r.height, heightUnit: r.height_unit, health: r.health };
  }
  return json({ summary });
}
