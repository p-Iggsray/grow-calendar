// @ts-check
// Tool-call executor for MJ's Gemini tool-calling loop, plus its small helpers.
import { parseDate } from "../../src/lib/dates-core.js";
import { htmlToPlainText } from "../../src/lib/richText.js";
import { ensureGrowLogSchema } from "../growLog.js";
import { firstGrowId } from "../perDayScope.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "../notes.js";
import { appendNoteText, buildDayInfo } from "../mj-logic.js";
import { eventsForDay, ensureGrowEventsSchema } from "../events.js";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey, normalizeLogEntry,
} from "../plantsRoster.js";
import { validateLifecycle } from "../grows.js";
import { normalizeLifecycle } from "../../src/lib/lifecycle.js";
import { todayInET } from "./usage.js";
import { ensurePlantLogSchema } from "../plants.js";
import { geocode } from "../geocode.js";
import { logError } from "../log.js";
import { DATE_RE } from "./constants.js";

const PROFILE_ENUMS = {
  environment:    new Set(["outdoor", "indoor", "greenhouse"]),
  medium:         new Set(["soil", "coco", "hydro", "other"]),
  containerType:  new Set(["fabric", "plastic", "ground", "other"]),
  experienceLevel:new Set(["beginner", "intermediate", "advanced"]),
  wateringMethod: new Set(["hand", "drip"]),
};

// Read/write a grow's survey JSON (where the plant roster lives). readSurvey
// returns {} for a grow with no survey yet, or null if the grow doesn't exist.
async function readSurvey(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;
  try { return row.survey ? JSON.parse(row.survey) : {}; } catch { return {}; }
}

async function writeSurvey(env, userId, growId, survey) {
  await env.DB.prepare(
    "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(survey), new Date().toISOString(), growId, userId).run();
}

function plantOut(p) {
  return { id: p.id, name: p.name, type: p.type, photo: p.photo, flowerWeeks: p.flowerWeeks, status: p.status, createdAt: p.createdAt ?? null };
}

function dateToYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tryParseArr(s) {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

function shapeLogRow(r) {
  return {
    date:         r.date,
    water_gal:    r.water_gal ?? null,
    temp_high:    r.temp_high ?? null,
    temp_low:     r.temp_low  ?? null,
    humidity:     r.humidity  ?? null,
    feed:         r.feed      ?? null,
    water_plants: tryParseArr(r.water_plants),
    training:     tryParseArr(r.training),
    plant_health: tryParseArr(r.plant_health),
  };
}

export async function executeTool(name, input, env, userId, timeline, actions, growId, rawGrow) {
  // Per-day reads/writes are grow-scoped; fall back to the user's first grow
  // when no active grow was supplied. (Grow-editing tools below keep using the
  // raw `growId` so their "no active grow" guards still apply.)
  const dayGrowId = growId ?? await firstGrowId(env, userId);
  try {
    if (name === "get_grow_info") {
      if (!growId || !rawGrow) return { error: "No active grow selected. Tap a grow in the Plan tab first." };
      // Make sure every plant in the roster has a stable id so the plant
      // edit/delete tools can target them; persist if we had to assign any.
      let survey = rawGrow.survey ?? {};
      const ensured = ensurePlantIds(survey);
      if (ensured.changed) { survey = ensured.survey; await writeSurvey(env, userId, growId, survey); }
      const plants = Array.isArray(survey?.strains) ? survey.strains.map(plantOut) : [];
      return {
        displayName: rawGrow.displayName,
        status: rawGrow.status,
        strains: plants.map(p => p.name).filter(Boolean),
        plants,
        location: rawGrow.survey?.location ?? null,
        profile: {
          environment:          survey?.environment ?? null,
          medium:               survey?.medium ?? null,
          containerType:        survey?.containerType ?? null,
          containerGallons:     survey?.containerGallons ?? null,
          location:             survey?.location ?? null,
          experienceLevel:      survey?.experienceLevel ?? null,
          wateringMethod:       survey?.wateringMethod ?? null,
          notes:                survey?.extraNotes ?? null,
        },
        // The recorded history, not a plan: every stage switch and its date.
        stageHistory: timeline?.events ?? [],
        growStartDate: timeline?.firstDate ?? null,
        growId,
      };
    }

    if (name === "update_grow_info") {
      if (!growId) return { error: "No active grow selected." };
      const fields = [];
      const binds = [];
      if (typeof input.display_name === "string" && input.display_name.trim()) {
        fields.push("display_name = ?");
        binds.push(input.display_name.trim().slice(0, 100));
      }
      if (["active", "harvested", "abandoned"].includes(input.status)) {
        fields.push("status = ?");
        binds.push(input.status);
      }
      if (fields.length === 0) return { error: "No valid fields to update." };
      fields.push("updated_at = ?");
      binds.push(new Date().toISOString(), growId, userId);
      await env.DB.prepare(
        `UPDATE grows SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
      ).bind(...binds).run();
      const parts = [];
      if (input.display_name) parts.push(`renamed to "${input.display_name.trim()}"`);
      if (input.status) parts.push(`status → ${input.status}`);
      actions.push({ type: "update_grow_info", summary: `Grow ${parts.join(", ")}`, undoPayload: null });
      return { ok: true };
    }

    if (name === "get_day") {
      const date = input?.date;
      if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
      await ensureGrowLogSchema(env);
      const [events, userNote, logRow] = await Promise.all([
        eventsForDay(env, userId, dayGrowId, date),
        readNote(env, userId, dayGrowId, date),
        env.DB.prepare(
          `SELECT date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health
           FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?`
        ).bind(userId, dayGrowId, date).first(),
      ]);
      return {
        ...buildDayInfo(date, timeline),
        events: events.map(e => ({ id: e.id, title: e.title, time: e.time, notes: e.notes })),
        journal: htmlToPlainText(userNote || ""),
        log: logRow ? shapeLogRow(logRow) : null,
      };
    }

    if (name === "get_week") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const startDt = parseDate(startDate);
      const endDt = new Date(startDt);
      endDt.setDate(endDt.getDate() + 6);
      const endDate = dateToYmd(endDt);
      await ensureGrowLogSchema(env);
      await ensureGrowEventsSchema(env);
      const [notesRes, logRes, eventsRes] = await Promise.all([
        env.DB.prepare(
          "SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ?"
        ).bind(userId, dayGrowId, startDate, endDate).all(),
        env.DB.prepare(
          `SELECT date, water_gal, feed, temp_high, temp_low, humidity
           FROM grow_log WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ?`
        ).bind(userId, dayGrowId, startDate, endDate).all(),
        env.DB.prepare(
          `SELECT date, title, time FROM grow_events
           WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ?
           ORDER BY date, time IS NULL, time, created_at`
        ).bind(userId, dayGrowId, startDate, endDate).all(),
      ]);
      const notesByDate = new Map((notesRes.results ?? []).map(r => [r.date, r.body]));
      const logByDate = new Map((logRes.results ?? []).map(r => [r.date, r]));
      const eventsByDate = new Map();
      for (const e of eventsRes.results ?? []) {
        if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
        eventsByDate.get(e.date).push(e.time ? `${e.time} ${e.title}` : e.title);
      }
      const days = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(startDt);
        dt.setDate(startDt.getDate() + i);
        const date = dateToYmd(dt);
        const day = buildDayInfo(date, timeline);
        const evs = eventsByDate.get(date);
        if (evs?.length) day.events = evs;
        const note = notesByDate.get(date);
        if (note) day.journal = htmlToPlainText(note).slice(0, 300);
        const log = logByDate.get(date);
        if (log) {
          day.log = {
            water_gal: log.water_gal ?? null,
            temp_high: log.temp_high ?? null,
            temp_low:  log.temp_low  ?? null,
            humidity:  log.humidity  ?? null,
            feed:      log.feed      ?? null,
          };
        }
        days.push(day);
      }
      return { start_date: startDate, end_date: endDate, days };
    }

    if (name === "get_grow_log") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const endDate = typeof input?.end_date === "string" && DATE_RE.test(input.end_date)
        ? input.end_date : startDate;

      await ensureGrowLogSchema(env);
      const res = await env.DB.prepare(
        `SELECT date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health
         FROM grow_log
         WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC`
      ).bind(userId, dayGrowId, startDate, endDate).all();

      return { start_date: startDate, end_date: endDate, entries: (res.results ?? []).map(shapeLogRow) };
    }

    if (name === "log_grow_data") {
      const date = input?.date;
      if (typeof date !== "string" || !DATE_RE.test(date)) {
        return { error: "date must be YYYY-MM-DD" };
      }

      function toNum(v) {
        if (v === null || v === undefined) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      function toStr(v) {
        if (!v || typeof v !== "string") return null;
        return v.trim().slice(0, 500) || null;
      }

      const water_gal = toNum(input.water_gal);
      const temp_high = toNum(input.temp_high);
      const temp_low  = toNum(input.temp_low);
      const humidity  = toNum(input.humidity);
      const feed      = toStr(input.feed);

      await ensureGrowLogSchema(env);
      await env.DB.prepare(`
        INSERT INTO grow_log (user_id, grow_id, date, water_gal, feed, temp_high, temp_low, humidity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, grow_id, date) DO UPDATE SET
          water_gal  = COALESCE(excluded.water_gal,  grow_log.water_gal),
          feed       = COALESCE(excluded.feed,       grow_log.feed),
          temp_high  = COALESCE(excluded.temp_high,  grow_log.temp_high),
          temp_low   = COALESCE(excluded.temp_low,   grow_log.temp_low),
          humidity   = COALESCE(excluded.humidity,   grow_log.humidity),
          updated_at = excluded.updated_at
      `).bind(userId, dayGrowId, date, water_gal, feed, temp_high, temp_low, humidity).run();

      actions.push({
        type: "log_grow_data",
        date,
        summary: buildLogSummary(date, water_gal, temp_high, temp_low, humidity, feed),
        undoPayload: null, // grow log writes are not undoable via the undo system
      });

      return {
        ok: true,
        date,
        logged: { water_gal, temp_high, temp_low, humidity, feed },
      };
    }

    if (name === "append_note") {
      const date = input?.date;
      if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
      if (typeof input?.text !== "string" || input.text.trim() === "") {
        return { error: "text must be a non-empty string" };
      }
      const existing = await readNote(env, userId, dayGrowId, date);
      const note = appendNoteText(existing, input.text);
      if (note.length > MAX_NOTE_LEN) return { error: "note would exceed the maximum length" };
      await writeNote(env, userId, dayGrowId, date, note);
      actions.push({
        type: "append_note", date,
        summary: `Added to ${date} note`,
        undoPayload: { type: "undo_append_note", date, originalNote: existing ?? "" },
      });
      return { date, note };
    }

    if (name === "replace_note") {
      const date = input?.date;
      if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
      if (typeof input?.text !== "string") {
        return { error: "text must be a string" };
      }
      const text = input.text.trim();
      if (text.length > MAX_NOTE_LEN) return { error: "note text exceeds maximum length" };
      await writeNote(env, userId, dayGrowId, date, text);
      actions.push({ type: "replace_note", date, summary: `Replaced ${date} note` });
      return { date, note: text };
    }

    if (name === "add_plant") {
      if (!growId) return { error: "No active grow selected. Tap a grow in the Plan tab first." };
      const v = validatePlantFields(input ?? {}, false);
      if (!v.ok) return { error: v.error };
      const survey = await readSurvey(env, userId, growId);
      if (survey === null) return { error: "Grow not found." };
      const ensured = ensurePlantIds(survey);
      const { survey: nextSurvey, plant } = addPlantToSurvey(ensured.survey, v.value);
      await writeSurvey(env, userId, growId, nextSurvey);
      actions.push({ type: "add_plant", summary: `Added plant: ${plant.name}` });
      return { ok: true, plant: plantOut(plant) };
    }

    if (name === "update_plant") {
      if (!growId) return { error: "No active grow selected." };
      const plantId = input?.plant_id;
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required - get it from get_grow_info." };
      const mapped = { ...(input ?? {}) };
      if (mapped.pot_size !== undefined) { mapped.potSize = mapped.pot_size; delete mapped.pot_size; }
      const v = validatePlantFields(mapped, true);
      if (!v.ok) return { error: v.error };
      if (Object.keys(v.value).length === 0) return { error: "No valid fields to update." };
      const survey = await readSurvey(env, userId, growId);
      if (survey === null) return { error: "Grow not found." };
      const ensured = ensurePlantIds(survey);
      const res = updatePlantInSurvey(ensured.survey, plantId, v.value);
      if (!res) return { error: `No plant with id ${plantId}. Call get_grow_info to see plant ids.` };
      await writeSurvey(env, userId, growId, res.survey);
      actions.push({ type: "update_plant", summary: `Updated plant: ${res.plant.name}` });
      return { ok: true, plant: plantOut(res.plant) };
    }

    if (name === "delete_plant") {
      if (!growId) return { error: "No active grow selected." };
      const plantId = input?.plant_id;
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required - get it from get_grow_info." };
      const survey = await readSurvey(env, userId, growId);
      if (survey === null) return { error: "Grow not found." };
      const ensured = ensurePlantIds(survey);
      const target = (ensured.survey.strains ?? []).find(s => s.id === plantId);
      const res = removePlantFromSurvey(ensured.survey, plantId);
      if (!res) return { error: `No plant with id ${plantId}. Call get_grow_info to see plant ids.` };
      await writeSurvey(env, userId, growId, res.survey);
      await ensurePlantLogSchema(env);
      await env.DB.prepare(
        "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ?"
      ).bind(userId, growId, plantId).run();
      actions.push({ type: "delete_plant", summary: `Deleted plant: ${target?.name ?? plantId}` });
      return { ok: true };
    }

    if (name === "update_grow_profile") {
      if (!growId) return { error: "No active grow selected." };
      const survey = await readSurvey(env, userId, growId);
      if (survey === null) return { error: "Grow not found." };

      const patch = {};
      const changes = [];
      const enumField = (inKey, surveyKey, label) => {
        if (input[inKey] === undefined) return null;
        if (!PROFILE_ENUMS[surveyKey].has(input[inKey]))
          return `${inKey} must be one of: ${[...PROFILE_ENUMS[surveyKey]].join(", ")}`;
        patch[surveyKey] = input[inKey];
        changes.push(`${label} → ${input[inKey]}`);
        return null;
      };

      for (const [inKey, surveyKey, label] of [
        ["environment", "environment", "environment"],
        ["medium", "medium", "medium"],
        ["container_type", "containerType", "container"],
        ["experience_level", "experienceLevel", "experience"],
        ["watering_method", "wateringMethod", "watering"],
      ]) {
        const err = enumField(inKey, surveyKey, label);
        if (err) return { error: err };
      }

      if (input.container_gallons !== undefined) {
        const g = Number(input.container_gallons);
        if (!Number.isFinite(g) || g < 1 || g > 400) return { error: "container_gallons out of range (1-400)" };
        patch.containerGallons = Math.round(g);
        changes.push(`container size → ${Math.round(g)} gal`);
      }
      if (input.notes !== undefined) {
        patch.extraNotes = String(input.notes).slice(0, 2000);
        changes.push("notes updated");
      }
      if (input.location !== undefined) {
        const loc = String(input.location).trim().slice(0, 200);
        patch.location = loc;
        changes.push(`location → ${loc}`);
        try { const geo = await geocode(loc); if (geo) { patch.lat = geo.lat; patch.lon = geo.lon; } }
        catch { /* keep existing coords if geocoding fails */ }
      }

      if (changes.length === 0) return { error: "No valid profile fields to update." };
      await writeSurvey(env, userId, growId, { ...survey, ...patch });
      actions.push({ type: "update_grow_profile", summary: `Profile: ${changes.join(", ")}` });
      return { ok: true, updated: patch };
    }

    if (name === "get_environment") {
      const date = typeof input?.date === "string" && DATE_RE.test(input.date) ? input.date : null;
      try {
        const overall = await env.DB.prepare(
          `SELECT COUNT(*) AS samples, MIN(date) AS first_day, MAX(date) AS last_day,
             ROUND(AVG(temp_f),1) AS t_avg, MIN(temp_f) AS t_min, MAX(temp_f) AS t_max,
             ROUND(AVG(humidity),1) AS h_avg, MIN(humidity) AS h_min, MAX(humidity) AS h_max,
             ROUND(AVG(vpd),2) AS v_avg, MIN(vpd) AS v_min, MAX(vpd) AS v_max
           FROM env_readings WHERE user_id = ? AND grow_id = ?`
        ).bind(userId, dayGrowId).first();
        if (!overall || Number(overall.samples) === 0) {
          return { imported: false, message: "No sensor data has been imported for this grow. The grower can import a controller CSV under More, Environment." };
        }
        const dayQuery = date
          ? env.DB.prepare(
              `SELECT date, COUNT(*) AS samples, ROUND(AVG(temp_f),1) AS temp_avg, MIN(temp_f) AS temp_min, MAX(temp_f) AS temp_max,
                 ROUND(AVG(humidity),1) AS rh_avg, MIN(humidity) AS rh_min, MAX(humidity) AS rh_max, ROUND(AVG(vpd),2) AS vpd_avg
               FROM env_readings WHERE user_id = ? AND grow_id = ? AND date = ? GROUP BY date`
            ).bind(userId, dayGrowId, date)
          : env.DB.prepare(
              `SELECT date, COUNT(*) AS samples, ROUND(AVG(temp_f),1) AS temp_avg, MIN(temp_f) AS temp_min, MAX(temp_f) AS temp_max,
                 ROUND(AVG(humidity),1) AS rh_avg, MIN(humidity) AS rh_min, MAX(humidity) AS rh_max, ROUND(AVG(vpd),2) AS vpd_avg
               FROM env_readings WHERE user_id = ? AND grow_id = ? GROUP BY date ORDER BY date DESC LIMIT 7`
            ).bind(userId, dayGrowId);
        const daysRes = await dayQuery.all();
        return {
          imported: true,
          overall: {
            minutesLogged: overall.samples, firstDay: overall.first_day, lastDay: overall.last_day,
            temp: { avg: overall.t_avg, min: overall.t_min, max: overall.t_max },
            humidity: { avg: overall.h_avg, min: overall.h_min, max: overall.h_max },
            vpd: { avg: overall.v_avg, min: overall.v_min, max: overall.v_max },
          },
          days: daysRes.results ?? [],
        };
      } catch {
        return { imported: false, message: "No sensor data has been imported for this grow yet." };
      }
    }

    if (name === "get_plant_log") {
      const plantId = input?.plant_id;
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required - get it from get_grow_info." };
      const limit = Math.max(1, Math.min(50, Number(input?.limit) || 25));
      await ensurePlantLogSchema(env);
      const res = await env.DB.prepare(
        `SELECT date, kind, detail, body, height, height_unit, health FROM plant_log
         WHERE user_id = ? AND grow_id = ? AND plant_id = ? ORDER BY date DESC, id DESC LIMIT ?`
      ).bind(userId, dayGrowId, plantId, limit).all();
      const entries = (res.results ?? []).map(r => {
        let detail = null;
        if (r.detail) { try { detail = JSON.parse(r.detail); } catch { /* skip */ } }
        return { date: r.date, kind: r.kind ?? "note", detail, body: r.body, height: r.height, heightUnit: r.height_unit, health: r.health };
      });
      return { entries, count: entries.length };
    }

    if (name === "add_plant_log_entry") {
      if (!growId) return { error: "No active grow selected." };
      const plantId = input?.plant_id;
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required - get it from get_grow_info." };
      const survey = await readSurvey(env, userId, growId);
      if (survey === null) return { error: "Grow not found." };
      const plant = (survey.strains ?? []).find(sp => sp.id === plantId);
      if (!plant) return { error: `No plant with id ${plantId}. Call get_grow_info to see plant ids.` };
      const todayIso = todayInET();
      const norm = normalizeLogEntry({
        date: input?.date ?? todayIso,
        kind: input?.kind ?? "note",
        body: input?.body ?? "",
        ...(input?.height !== undefined ? { height: input.height } : {}),
        ...(input?.height_unit !== undefined ? { heightUnit: input.height_unit } : {}),
        ...(input?.health !== undefined ? { health: input.health } : {}),
      }, false, todayIso);
      if (!norm.ok) return { error: norm.error };
      await ensurePlantLogSchema(env);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO plant_log (user_id, grow_id, plant_id, date, kind, detail, body, height, height_unit, health, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        userId, growId, plantId,
        norm.value.date, norm.value.kind, norm.value.detail ?? null, norm.value.body ?? "",
        norm.value.height ?? null, norm.value.height_unit ?? null, norm.value.health ?? null,
        now, now,
      ).run();
      actions.push({ type: "add_plant_log_entry", summary: `Logged for ${plant.name}: ${(norm.value.body || norm.value.kind).slice(0, 50)}` });
      return { ok: true, plant: plant.name, date: norm.value.date, kind: norm.value.kind };
    }

    if (name === "lifecycle_action") {
      if (!growId || !rawGrow) return { error: "No active grow selected." };
      const action = input?.action;
      const todayIso = todayInET();
      const lc = normalizeLifecycle(rawGrow.lifecycle);
      let next;
      let summary;
      if (action === "start_drying") {
        next = { ...lc, phase: "drying", dryStartedAt: todayIso };
        summary = "Started the drying tracker";
      } else if (action === "move_to_curing") {
        next = { ...lc, phase: "curing", cureStartedAt: todayIso };
        summary = "Moved to curing";
      } else if (action === "finish_grow") {
        next = { ...lc, phase: "done", finishedAt: todayIso };
        summary = "Finished the grow";
      } else if (action === "log_burp") {
        const rh = Number.isFinite(Number(input?.rh)) ? Number(input.rh) : null;
        next = { ...lc, cureLogs: [...lc.cureLogs, { date: todayIso, rh, burped: true, note: "" }] };
        summary = "Logged a jar burp";
      } else if (action === "log_dry_reading") {
        const tempF = Number.isFinite(Number(input?.temp_f)) ? Number(input.temp_f) : null;
        const rh = Number.isFinite(Number(input?.rh)) ? Number(input.rh) : null;
        if (tempF === null && rh === null) return { error: "log_dry_reading needs temp_f or rh." };
        const rest = lc.dryLogs.filter(l => l.date !== todayIso);
        next = { ...lc, dryLogs: [...rest, { date: todayIso, tempF, rh, note: "" }] };
        summary = "Logged a dry-space reading";
      } else {
        return { error: "Unknown lifecycle action." };
      }
      const v = validateLifecycle(next);
      if (!v.ok) return { error: v.error };
      const now = new Date().toISOString();
      if (v.value.phase === "done") {
        await env.DB.prepare(
          "UPDATE grows SET lifecycle = ?, status = 'harvested', updated_at = ? WHERE id = ? AND user_id = ?"
        ).bind(JSON.stringify(v.value), now, growId, userId).run();
      } else {
        await env.DB.prepare(
          "UPDATE grows SET lifecycle = ?, updated_at = ? WHERE id = ? AND user_id = ?"
        ).bind(JSON.stringify(v.value), now, growId, userId).run();
      }
      actions.push({ type: "lifecycle_action", summary });
      return { ok: true, phase: v.value.phase, action };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    logError("mj-tool", { tool: name, message: String(err?.message ?? err) });
    return { error: "tool failed to execute" };
  }
}

function buildLogSummary(date, water_gal, temp_high, temp_low, humidity, feed) {
  const parts = [];
  if (water_gal != null) parts.push(`${water_gal} gal water`);
  if (temp_high != null || temp_low != null) parts.push(`temp ${temp_high ?? "?"}°/${temp_low ?? "?"}°F`);
  if (humidity != null) parts.push(`${humidity}% RH`);
  if (feed) parts.push(`fed: ${feed.slice(0, 40)}`);
  return `Logged ${date}: ${parts.join(", ") || "(no fields)"}`;
}
