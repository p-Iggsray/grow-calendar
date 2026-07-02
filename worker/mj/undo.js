// @ts-check
// POST /mj/undo - reverts task check-offs and note appends made by MJ tools.
import { json, error, safeJsonBounded } from "../util.js";
import { loadRawPlan } from "../plan.js";
import { loadRawGrow } from "../grows.js";
import { parseConfig, parseDate } from "../../src/lib/planConfig.js";
import { getPhase, getDetail } from "../../src/lib/growData.js";
import { readCheckoffs, writeCheckoffs } from "../checkoffs.js";
import { firstGrowId } from "../perDayScope.js";
import { writeNote, MAX_NOTE_LEN } from "../notes.js";
import { mergeChecked } from "../mj-logic.js";
import { DATE_RE } from "./constants.js";

export async function postMjUndo(request, env, user) {
  const parsed = await safeJsonBounded(request, 4096);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  const { type, date } = body ?? {};

  if (typeof date !== "string" || !DATE_RE.test(date)) return error(400, "date must be YYYY-MM-DD");

  const growId = new URL(request.url).searchParams.get("growId") || await firstGrowId(env, user.id);

  // Resolve the same plan the forward tool used: prefer the active grow's row
  // (grows table), fall back to the legacy plan_config. Using loadRawPlan here
  // unconditionally meant the task indices were validated against a different
  // (often empty) plan than the one set_tasks_done wrote to, so undo silently
  // no-opped or 400'd for multi-grow users.
  async function loadRawForGrow() {
    if (growId) {
      const g = await loadRawGrow(env, user.id, growId);
      if (g) return g;
    }
    return loadRawPlan(env, user.id);
  }

  if (type === "set_tasks_done") {
    const { taskIndices, done } = body;
    if (!Array.isArray(taskIndices) || typeof done !== "boolean") return error(400, "invalid undo payload");
    const raw = await loadRawForGrow();
    if (raw.needsSetup) return error(400, "no plan configured");
    const config = parseConfig(raw.config);
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return error(400, `no plan for ${date}`);
    const detail = getDetail(dt, config, raw.overrides, raw.generatedPlan, raw.phaseOverrides, raw.eventRules ?? []);
    const inRange = taskIndices.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < detail.tasks.length);
    const current = await readCheckoffs(env, user.id, growId, date);
    const next = mergeChecked(current, inRange, done);
    await writeCheckoffs(env, user.id, growId, date, next);
    return json({ ok: true, checked: next });
  }

  if (type === "undo_append_note") {
    const { originalNote } = body;
    if (typeof originalNote !== "string") return error(400, "invalid undo payload");
    if (originalNote.length > MAX_NOTE_LEN) return error(400, "original note too long");
    await writeNote(env, user.id, growId, date, originalNote);
    return json({ ok: true });
  }

  return error(400, "unknown undo type");
}
