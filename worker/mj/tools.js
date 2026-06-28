// @ts-check
// Tool-call executor for MJ's Gemini tool-calling loop, plus its small helpers.
import { parseDate } from "../../src/lib/planConfig.js";
import { getPhase, getDetail, getThreatsForPhase, PHASES } from "../../src/lib/growData.js";
import { readCheckoffs, writeCheckoffs } from "../checkoffs.js";
import { ensureGrowLogSchema } from "../growLog.js";
import { firstGrowId } from "../perDayScope.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "../notes.js";
import { mergeChecked, appendNoteText, buildDayView, VALID_GROW_PHASES, VALID_CONFIG_DATE_KEYS } from "../mj-logic.js";
import { validateEventRule, MAX_RULES_PER_GROW } from "../eventRulesValidate.js";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey,
} from "../plantsRoster.js";
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

function newRuleId() {
  return "evt_" + Math.random().toString(36).slice(2, 10);
}

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
  return { id: p.id, name: p.name, type: p.type, photo: p.photo, flowerWeeks: p.flowerWeeks, status: p.status };
}

async function readActiveRules(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT event_rules FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;
  try { return row.event_rules ? JSON.parse(row.event_rules) : []; } catch { return []; }
}

async function writeActiveRules(env, userId, growId, rules) {
  await env.DB.prepare(
    "UPDATE grows SET event_rules = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(rules), new Date().toISOString(), growId, userId).run();
}

function dateToYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function readCheckoffsInRange(env, userId, growId, startDate, endDate) {
  const rows = await env.DB.prepare(
    "SELECT date, task_index FROM task_checkoffs WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ? ORDER BY date, task_index",
  ).bind(userId, growId, startDate, endDate).all();
  const map = new Map();
  for (const r of rows.results ?? []) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r.task_index);
  }
  return map;
}

export async function executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions, growId, rawGrow, eventRules = []) {
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
      const strains = plants.length
        ? plants.map(p => p.name).filter(Boolean)
        : (rawGrow.generatedPlan?.strains?.map(s => s.name).filter(Boolean) ?? []);
      const phasesWithOverrides = Object.keys(rawGrow.phaseOverrides ?? {});
      return {
        displayName: rawGrow.displayName,
        status: rawGrow.status,
        strains,
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
          vegWeeks:             survey?.vegWeeks ?? null,
          plantsAlreadyOutside: survey?.plantsAlreadyOutside ?? null,
          notes:                survey?.extraNotes ?? null,
        },
        configDates: rawGrow.config ?? {},
        phasesWithOverrides,
        eventRules: (rawGrow.eventRules ?? []).map(r => ({ id: r.id, label: r.label, task: r.task, enabled: r.enabled !== false, window: r.window, cadence: r.cadence })),
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

    if (name === "update_grow_dates") {
      if (!growId || !rawGrow?.config) return { error: "No active grow or config found." };
      const patches = input?.patches;
      if (!patches || typeof patches !== "object" || Array.isArray(patches)) {
        return { error: "patches must be an object mapping config key → YYYY-MM-DD date string." };
      }
      const updated = {};
      for (const [key, val] of Object.entries(patches)) {
        if (!VALID_CONFIG_DATE_KEYS.has(key)) return { error: `Unknown config key: "${key}"` };
        if (typeof val !== "string" || !DATE_RE.test(val)) return { error: `${key}: value must be YYYY-MM-DD` };
        updated[key] = val;
      }
      const newConfig = { ...rawGrow.config, ...updated };
      await env.DB.prepare(
        "UPDATE grows SET config = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(newConfig), new Date().toISOString(), growId, userId).run();
      const changeList = Object.entries(updated)
        .map(([k, v]) => `${k}: ${rawGrow.config[k] ?? "none"} → ${v}`)
        .join(", ");
      actions.push({ type: "update_grow_dates", summary: `Updated: ${changeList}`, undoPayload: null });
      return { ok: true, updated };
    }

    if (name === "update_phase_tasks") {
      if (!growId) return { error: "No active grow selected." };
      const phase = input?.phase;
      if (typeof phase !== "string" || !VALID_GROW_PHASES.has(phase)) {
        return { error: `Invalid phase "${phase}". Valid: ${[...VALID_GROW_PHASES].join(", ")}` };
      }
      const tasks = input?.tasks ?? null;
      const phaseRow = await env.DB.prepare(
        "SELECT phase_overrides FROM grows WHERE id = ? AND user_id = ?"
      ).bind(growId, userId).first();
      if (!phaseRow) return { error: "Grow not found." };
      let currentOverrides = {};
      try { currentOverrides = phaseRow.phase_overrides ? JSON.parse(phaseRow.phase_overrides) : {}; } catch { /* start clean */ }
      if (tasks === null || (Array.isArray(tasks) && tasks.length === 0)) {
        delete currentOverrides[phase];
      } else if (Array.isArray(tasks)) {
        const cleaned = tasks.map(t => String(t).trim()).filter(Boolean);
        currentOverrides[phase] = { ...(currentOverrides[phase] ?? {}), tasks: cleaned };
      } else {
        return { error: "tasks must be an array of strings or null to clear." };
      }
      await env.DB.prepare(
        "UPDATE grows SET phase_overrides = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(currentOverrides), new Date().toISOString(), growId, userId).run();
      const summary = tasks?.length
        ? `Updated ${phase} tasks (${tasks.length} task${tasks.length === 1 ? "" : "s"})`
        : `Cleared ${phase} task overrides — defaults restored`;
      actions.push({ type: "update_phase_tasks", summary, undoPayload: null });
      return { ok: true, phase, taskCount: tasks?.length ?? 0 };
    }

    if (name === "create_event_rule") {
      if (!growId) return { error: "No active grow selected. Tap a grow in the Plan tab first." };
      const rules = await readActiveRules(env, userId, growId);
      if (rules === null) return { error: "Grow not found." };
      if (rules.length >= MAX_RULES_PER_GROW) return { error: `Rule limit (${MAX_RULES_PER_GROW}) reached.` };

      const rule = {
        id: newRuleId(),
        label: typeof input?.label === "string" ? input.label.slice(0, 80) : "",
        task: typeof input?.task === "string" ? input.task : "",
        enabled: true,
        window: input?.window ?? null,
        cadence: input?.cadence ?? null,
        createdAt: new Date().toISOString(),
      };
      const invalid = validateEventRule(rule);
      if (invalid) return { error: invalid };

      rules.push(rule);
      await writeActiveRules(env, userId, growId, rules);
      actions.push({ type: "create_event_rule", summary: `Added recurring event: ${rule.label || rule.task}` });
      return { ok: true, rule };
    }

    if (name === "delete_event_rule") {
      if (!growId) return { error: "No active grow selected." };
      const rules = await readActiveRules(env, userId, growId);
      if (rules === null) return { error: "Grow not found." };
      const target = rules.find(r => r.id === input?.id);
      if (!target) return { error: `No event rule with id ${input?.id}.` };
      await writeActiveRules(env, userId, growId, rules.filter(r => r.id !== input.id));
      actions.push({ type: "delete_event_rule", summary: `Removed recurring event: ${target.label || target.task}` });
      return { ok: true };
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
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required — get it from get_grow_info." };
      const v = validatePlantFields(input ?? {}, true);
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
      if (typeof plantId !== "string" || !plantId) return { error: "plant_id is required — get it from get_grow_info." };
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
      if (input.veg_weeks !== undefined) {
        const w = Number(input.veg_weeks);
        if (!Number.isFinite(w) || w < 1 || w > 52) return { error: "veg_weeks out of range (1-52)" };
        patch.vegWeeks = Math.round(w);
        changes.push(`veg weeks → ${Math.round(w)}`);
      }
      if (input.plants_already_outside !== undefined) {
        patch.plantsAlreadyOutside = Boolean(input.plants_already_outside);
        changes.push(`plants already outside → ${patch.plantsAlreadyOutside}`);
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

    if (name === "get_week") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const startDt = parseDate(startDate);
      const endDt = new Date(startDt);
      endDt.setDate(endDt.getDate() + 6);
      const endDate = dateToYmd(endDt);
      const checkoffMap = await readCheckoffsInRange(env, userId, dayGrowId, startDate, endDate);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(startDt);
        dt.setDate(startDt.getDate() + i);
        const date = dateToYmd(dt);
        const phase = getPhase(dt, config);
        if (!phase) {
          days.push({ date, outside_season: true });
          continue;
        }
        const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides, eventRules);
        const checked = checkoffMap.get(date) ?? [];
        const userNote = await readNote(env, userId, dayGrowId, date);
        const threats = getThreatsForPhase(phase, generatedPlan);
        const dayView = buildDayView(date, phase, detail, checked, userNote);
        if (threats.length > 0) dayView.threats = threats.map(t => t.title);
        days.push(dayView);
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

      function tryParseArr(s) {
        if (!s) return [];
        try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
      }

      const entries = (res.results ?? []).map(r => ({
        date:         r.date,
        water_gal:    r.water_gal ?? null,
        temp_high:    r.temp_high ?? null,
        temp_low:     r.temp_low  ?? null,
        humidity:     r.humidity  ?? null,
        feed:         r.feed      ?? null,
        water_plants: tryParseArr(r.water_plants),
        training:     tryParseArr(r.training),
        plant_health: tryParseArr(r.plant_health),
      }));
      return { start_date: startDate, end_date: endDate, entries };
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

    // All remaining tools require a date + season check
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return { error: `no plan for ${date} (outside the grow season)` };

    if (name === "get_day") {
      const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides, eventRules);
      const checked = await readCheckoffs(env, userId, dayGrowId, date);
      const userNote = await readNote(env, userId, dayGrowId, date);
      const phaseInfo = PHASES[phase] ?? {};
      return { ...buildDayView(date, phase, detail, checked, userNote), phaseLabel: phaseInfo.label ?? phase };
    }

    if (name === "set_tasks_done") {
      const indices = Array.isArray(input?.taskIndices)
        ? input.taskIndices.map(Number).filter(Number.isInteger) : null;
      if (!indices) return { error: "taskIndices must be an array of integers" };
      if (typeof input?.done !== "boolean") return { error: "done must be a boolean" };
      const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides, eventRules);
      const inRange = indices.filter(i => i >= 0 && i < detail.tasks.length);
      const ignored = indices.filter(i => i < 0 || i >= detail.tasks.length);
      const current = await readCheckoffs(env, userId, dayGrowId, date);
      const next = mergeChecked(current, inRange, input.done);
      await writeCheckoffs(env, userId, dayGrowId, date, next);
      actions.push({
        type: "set_tasks_done", date,
        summary: describeChecked(detail, inRange, input.done),
        undoPayload: { type: "set_tasks_done", date, taskIndices: inRange, done: !input.done },
      });
      return { date, checked: next, ignored };
    }

    if (name === "append_note") {
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
      if (typeof input?.text !== "string") {
        return { error: "text must be a string" };
      }
      const text = input.text.trim();
      if (text.length > MAX_NOTE_LEN) return { error: "note text exceeds maximum length" };
      await writeNote(env, userId, dayGrowId, date, text);
      actions.push({ type: "replace_note", date, summary: `Replaced ${date} note` });
      return { date, note: text };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    logError("mj-tool", { tool: name, message: String(err?.message ?? err) });
    return { error: "tool failed to execute" };
  }
}

function describeChecked(detail, indices, done) {
  const verb = done ? "Marked done" : "Un-checked";
  if (indices.length === 1) {
    const t = detail.tasks[indices[0]] || "";
    return `${verb}: ${t.slice(0, 60)}`;
  }
  return `${verb} ${indices.length} tasks`;
}

function buildLogSummary(date, water_gal, temp_high, temp_low, humidity, feed) {
  const parts = [];
  if (water_gal != null) parts.push(`${water_gal} gal water`);
  if (temp_high != null || temp_low != null) parts.push(`temp ${temp_high ?? "?"}°/${temp_low ?? "?"}°F`);
  if (humidity != null) parts.push(`${humidity}% RH`);
  if (feed) parts.push(`fed: ${feed.slice(0, 40)}`);
  return `Logged ${date}: ${parts.join(", ") || "(no fields)"}`;
}
