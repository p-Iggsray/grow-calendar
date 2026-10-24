// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey, normalizeLogEntry,
  stageSet, todayKey, isPastDateKey,
} from "./plantsRoster.js";

import { ensureGrowLogSchema } from "./growLog.js";
import { stageFromLogRow as stageFromRow } from "../src/lib/plantClock.js";
import { isWaterUnit } from "../src/lib/waterUnits.js";
import { STAGE_LABEL, cropOf, defaultStage, stagesFor, words } from "../src/lib/crops.js";

function parseSurvey(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function ownedGrowRow(env, userId, growId) {
  return env.DB.prepare(
    "SELECT survey, created_at FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
}

async function saveSurvey(env, userId, growId, survey) {
  await env.DB.prepare(
    "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(survey), new Date().toISOString(), growId, userId).run();
}

let _schemaReady = false;
// The one way a stage switch is written, so setup, adding a plant and dating a
// stage all write the same row.
const INSERT_STAGE_SQL = `INSERT INTO plant_log
   (user_id, grow_id, plant_id, date, kind, detail, body, height, height_unit, health, created_at, updated_at)
 VALUES (?, ?, ?, ?, 'stage', ?, ?, NULL, NULL, NULL, ?, ?)`;

function stageBody(stage) {
  return `Stage → ${STAGE_LABEL[stage]}`;
}

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

// Write one "moved to <stage>" entry per plant, dated the day the space was
// created. This is the ONLY date the app writes on its own, and it is not a
// guess about the past: it records what the grower said was true on the day
// they set the space up. Every later stage date comes from a manual switch.
export async function seedStageEntries(env, userId, growId, survey) {
  const date = todayKey();
  const crop = cropOf(survey);
  const allowed = stageSet(crop);
  const fallback = defaultStage(crop);
  const plants = (survey?.strains ?? []).filter((p) => p?.id && allowed.has(p.stage ?? fallback));
  if (plants.length === 0) return;
  try {
    await ensurePlantLogSchema(env);
    const now = new Date().toISOString();
    // Re-running setup must not stack duplicate seeds on the same day.
    await env.DB.prepare(
      "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND kind = 'stage' AND date = ?"
    ).bind(userId, growId, date).run();
    const stmt = env.DB.prepare(INSERT_STAGE_SQL);
    await env.DB.batch(plants.map((p) => {
      const stage = p.stage ?? fallback;
      return stmt.bind(userId, growId, p.id, date, JSON.stringify({ stage }), stageBody(stage), now, now);
    }));
  } catch (err) {
    logError("grow-setup-stage-seed", { message: String(err?.message) });
  }
}

// POST /api/grows/:id/plants
export async function addPlant(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const survey = parseSurvey(row.survey) ?? {};
  const crop = cropOf(survey);

  const v = validatePlantFields(body ?? {}, false, crop);
  if (!v.ok) return error(400, v.error);

  // A plant can join at any stage. `createdAt` is always today, the day the
  // app heard of it; the grower can say when it really started (`startedOn`)
  // and since when it has been in the stage it joins at (`stageSince`), so a
  // plant added at week three of flower counts from week three.
  const createdAt = todayKey();
  const stage = v.value.stage ?? defaultStage(crop);
  const since = joinStageDate(body ?? {}, v.value.startedOn, stage, crop, createdAt);
  if (!since.ok) return error(400, since.error);
  // A plant already in a stage before today was alive before today: without a
  // start date of its own it started no later than that, or its clock would
  // begin after its own stage did.
  const fields = !v.value.startedOn && since.date < createdAt ? { ...v.value, startedOn: since.date } : v.value;

  const { survey: nextSurvey, plant } = addPlantToSurvey(survey, fields, undefined, createdAt);
  await saveSurvey(env, user.id, growId, nextSurvey);

  if (stageSet(crop).has(stage)) {
    try {
      await recordStageSwitch(env, user.id, growId, plant.id, stage, since.date);
    } catch (err) {
      logError("plant-add-stage-seed", { message: String(err?.message) });
    }
  }

  return json({ ok: true, plant });
}

/**
 * Pure: the day a new plant entered the stage it joins at. An explicit
 * `stageSince` wins; a plant joining no later than the usual starting stage
 * (a seedling) was in it from the day it started; otherwise it is today, as
 * it always was. Never before the plant's start, never in the future.
 */
export function joinStageDate(body, startedOn, stage, crop, todayIso) {
  const ladder = stagesFor(crop);
  let date = todayIso;
  if (body.stageSince !== undefined && body.stageSince !== null && body.stageSince !== "") {
    if (!isPastDateKey(body.stageSince, todayIso)) return { ok: false, error: "stageSince must be a past date" };
    date = body.stageSince;
  } else if (startedOn && ladder.indexOf(stage) <= ladder.indexOf(defaultStage(crop))) {
    date = startedOn;
  }
  // With no start date given, the stage date is the earliest thing known, and
  // the plant is taken to have started then (see addPlant).
  if (startedOn && date < startedOn) return { ok: false, error: "a plant cannot enter a stage before it started" };
  return { ok: true, date };
}

/** Write one stage switch: the record every age and harvest window reads. */
async function recordStageSwitch(env, userId, growId, plantId, stage, date) {
  await ensurePlantLogSchema(env);
  const now = new Date().toISOString();
  await env.DB.prepare(INSERT_STAGE_SQL)
    .bind(userId, growId, plantId, date, JSON.stringify({ stage }), stageBody(stage), now, now).run();
}

/**
 * Move the date of a plant's latest stage switch, which is what "in this stage
 * since" edits. It may not go before the switch ahead of it, or before the
 * plant started. A plant from before switches were recorded has none, so one
 * is written for the stage it is in. Returns an error message, or null.
 */
async function moveCurrentStageDate(env, userId, growId, plantId, date, startedOn, stage) {
  if (!isPastDateKey(date)) return "stageSince must be a past date";
  if (startedOn && date < startedOn) return "a plant cannot enter a stage before it started";
  if (!stage || !STAGE_LABEL[stage]) return "this plant has no stage to date";
  await ensurePlantLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT id, date, body, detail FROM plant_log
     WHERE user_id = ? AND grow_id = ? AND plant_id = ? AND kind = 'stage'
     ORDER BY date DESC, id DESC LIMIT 2`
  ).bind(userId, growId, plantId).all();
  const [latest, previous] = res.results ?? [];
  // The latest record is not this stage when the plant got here without one
  // being written (older plants). Then the switch to this stage is
  // the thing being dated, and it is written rather than moving the one before.
  if (!latest || stageFromRow(latest) !== stage) {
    if (latest && date < latest.date) return "that is before the stage it came from";
    await recordStageSwitch(env, userId, growId, plantId, stage, date);
    return null;
  }
  if (previous && date < previous.date) return "that is before the stage it came from";
  await env.DB.prepare("UPDATE plant_log SET date = ?, updated_at = ? WHERE id = ?")
    .bind(date, new Date().toISOString(), latest.id).run();
  return null;
}

// PATCH /api/grows/:id/plants/:plantId
export async function patchPlant(request, env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const ensured = ensurePlantIds(parseSurvey(row.survey) ?? {});
  const crop = cropOf(ensured.survey);
  const ladder = stagesFor(crop);

  const v = validatePlantFields(body ?? {}, true, crop);
  if (!v.ok) return error(400, v.error);
  const stageSince = body?.stageSince;
  if (Object.keys(v.value).length === 0 && !stageSince) return error(400, "no valid fields");

  const before = (ensured.survey.strains ?? []).find((s) => s.id === plantId);
  if (!before) return error(404, "plant not found");
  // Dating a stage and changing it in one request is ambiguous (which switch
  // is being dated?), so the two are separate requests.
  if (stageSince && v.value.stage !== undefined) {
    return error(400, "change the stage and its date in separate requests");
  }
  const merged = { ...before, ...v.value };
  if (merged.flowerWeeksMax != null && merged.flowerWeeks != null && merged.flowerWeeksMax < merged.flowerWeeks) {
    return error(400, "the most weeks cannot be fewer than the least");
  }

  // Stage changes are one-way: a plant only ever moves forward through its
  // lifecycle. Same stage is a harmless no-op; backward is rejected.
  if (v.value.stage !== undefined) {
    const from = ladder.indexOf(before.stage ?? defaultStage(crop));
    const to = ladder.indexOf(v.value.stage);
    if (to < from) return error(400, `stage changes are one-way - a ${words(crop).unit} cannot move back to an earlier stage`);
    if (to === from) delete v.value.stage;
    if (Object.keys(v.value).length === 0) return json({ ok: true, plant: before });
  }

  // Everything else has been checked, so the date move is the last thing that
  // can refuse: nothing is written before a request is known to be good.
  if (stageSince) {
    const problem = await moveCurrentStageDate(
      env, user.id, growId, plantId, stageSince, merged.startedOn ?? null, merged.stage ?? defaultStage(crop),
    );
    if (problem) return error(400, problem);
    if (Object.keys(v.value).length === 0) return json({ ok: true, plant: before });
  }

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

export { parseSurvey, saveSurvey };

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

// GET /api/grows/:id/plants/:plantId/daily -- per-plant entries from the daily
// grow log (water/training/health) surfaced as read-only history items, so a
// plant's record reflects what was logged on the day screen. Matches by plant
// id; falls back to the plant's name for rows logged before id linking existed.
export async function dailyLogForPlant(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const survey = parseSurvey(row.survey);
  const name = (survey?.strains ?? []).find((s) => s.id === plantId)?.name ?? null;

  await ensureGrowLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT date, water_plants, training, plant_health FROM grow_log
     WHERE user_id = ? AND grow_id = ? ORDER BY date DESC`
  ).bind(user.id, growId).all();

  const parse = (s) => { if (!s) return []; try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
  const mine = (e) => e && (e.plantId === plantId || (!e.plantId && name && (e.plant ?? "") === name));
  const numOrUndef = (v) => (v == null || v === "" ? undefined : Number(v));

  const out = [];
  let i = 0;
  for (const r of res.results ?? []) {
    for (const w of parse(r.water_plants)) {
      if (!mine(w)) continue;
      // The number that was typed and its unit travel with the canonical
      // gallons, so this reads "3 L" in the plant's history rather than the
      // gallons it happens to be summed in.
      out.push({
        id: `daily_${r.date}_w_${i++}`, date: r.date, kind: "watering", source: "daily",
        detail: {
          gal: numOrUndef(w.gal),
          amount: numOrUndef(w.amount),
          unit: isWaterUnit(w.unit) ? w.unit : undefined,
        },
        body: "",
      });
    }
    for (const t of parse(r.training)) {
      if (!mine(t) || !(t.action ?? "").trim()) continue;
      out.push({ id: `daily_${r.date}_t_${i++}`, date: r.date, kind: "training", source: "daily", detail: { action: t.action }, body: "" });
    }
    for (const h of parse(r.plant_health)) {
      if (!mine(h)) continue;
      out.push({ id: `daily_${r.date}_h_${i++}`, date: r.date, kind: "health", source: "daily", detail: { color: h.color || undefined, trichomes: h.trichomes || undefined }, body: h.notes || "" });
    }
  }
  return json({ entries: out });
}

// GET /api/grows/:id/plant-log-summary -- latest metric row + entry count per
// plant, in two grouped queries.
export async function plantLogSummary(env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const [latest, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT plant_id, date, height, height_unit, health FROM (
         SELECT plant_id, date, height, height_unit, health,
                ROW_NUMBER() OVER (PARTITION BY plant_id ORDER BY date DESC, id DESC) AS rn
         FROM plant_log WHERE user_id = ? AND grow_id = ?
       ) WHERE rn = 1`
    ).bind(user.id, growId).all(),
    env.DB.prepare(
      "SELECT plant_id, COUNT(*) AS n FROM plant_log WHERE user_id = ? AND grow_id = ? GROUP BY plant_id"
    ).bind(user.id, growId).all(),
  ]);
  const summary = {};
  for (const r of latest.results ?? []) {
    summary[r.plant_id] = { date: r.date, height: r.height, heightUnit: r.height_unit, health: r.health };
  }
  for (const r of counts.results ?? []) {
    (summary[r.plant_id] ??= {}).entries = r.n;
  }
  return json({ summary });
}
