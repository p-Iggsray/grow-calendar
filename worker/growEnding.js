// Ending a run without ending the space.
//
// See src/lib/growEnding.js for the shape and the reasoning. What matters here
// is what this endpoint deliberately does NOT do: it never writes `grows.status`.
// Finishing the post-harvest lifecycle already flips a space to 'harvested',
// which drops it out of the active view, and that is right for a run that is
// completely done with. It is wrong for a bed you will plant again, and this is
// the path for that case.
//
// The write is append-and-apply, in one place, because the two halves have to
// agree: the ending records what each plant became, and the roster is set to
// match. Recording one without the other leaves a space claiming three plants
// are still growing under an ending that says they were stolen.

import { json, error, nowIso, safeJsonBounded } from "./util.js";
import { cropOf } from "../src/lib/crops.js";
import { OUTCOME_VALUES, FATE_VALUES, isEndReason, endingList } from "../src/lib/growEnding.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX = 2000;
// An ending per run, and a space that has held fifty runs has earned its
// history. The cap is only here so a loop or a bad client cannot grow the row
// without limit.
const MAX_ENDINGS = 200;

let _endingsColumn = false;
async function ensureEndingsColumn(env) {
  if (_endingsColumn) return;
  try { await env.DB.prepare("ALTER TABLE grows ADD COLUMN endings TEXT").run(); } catch { /* exists */ }
  _endingsColumn = true;
}

function parseJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Validate one ending against the crop it belongs to.
 *
 * `plants` is checked against the roster by the caller; this only judges the
 * shape. A reason is required when the run ended short and refused when it
 * finished, because "Finished, reason: pests" is a contradiction somebody would
 * later have to interpret.
 */
export function validateEnding(input, crop, rosterIds) {
  if (!input || typeof input !== "object") return { ok: false, error: "ending object required" };
  if (!OUTCOME_VALUES.has(input.outcome)) return { ok: false, error: "invalid outcome" };
  if (typeof input.endedOn !== "string" || !DATE_RE.test(input.endedOn)) {
    return { ok: false, error: "endedOn must be YYYY-MM-DD" };
  }

  let reason = null;
  if (input.outcome === "lost") {
    if (!isEndReason(input.reason, crop)) return { ok: false, error: "invalid reason" };
    reason = input.reason;
  } else if (input.reason) {
    return { ok: false, error: "a finished grow takes no reason" };
  }

  const seen = new Set();
  const plants = [];
  for (const p of Array.isArray(input.plants) ? input.plants : []) {
    if (!p || typeof p !== "string" && typeof p.id !== "string") continue;
    const id = p.id;
    // A fate for a plant this space does not have is either a stale screen or
    // a bad client, and applying it would write a roster entry out of nothing.
    if (!rosterIds.has(id) || seen.has(id)) continue;
    if (!FATE_VALUES.has(p.status)) return { ok: false, error: `invalid fate for ${id}` };
    seen.add(id);
    plants.push({
      id,
      name: typeof p.name === "string" ? p.name.slice(0, 60) : "",
      status: p.status,
      // What it was before, so the ending can be undone as one piece.
      wasStatus: typeof p.wasStatus === "string" ? p.wasStatus : "growing",
    });
  }

  return {
    ok: true,
    value: {
      endedOn: input.endedOn,
      outcome: input.outcome,
      reason,
      note: typeof input.note === "string" ? input.note.slice(0, NOTE_MAX) : "",
      plants,
      recordedAt: nowIso(),
    },
  };
}

async function loadGrow(env, userId, growId) {
  await ensureEndingsColumn(env);
  return env.DB.prepare(
    "SELECT id, survey, endings FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
}

/**
 * POST /api/grows/:id/ending
 *
 * Appends the ending and sets each named plant to the fate it records. The
 * space's status is untouched on purpose.
 */
export async function endGrow(request, env, user, growId) {
  const row = await loadGrow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  const p = await safeJsonBounded(request, 65536);
  if (!p.ok) return error(p.status, p.error);

  const survey = parseJson(row.survey);
  const roster = Array.isArray(survey?.strains) ? survey.strains : [];
  const rosterIds = new Set(roster.map((s) => s?.id).filter(Boolean));

  const v = validateEnding(p.data?.ending, cropOf(survey), rosterIds);
  if (!v.ok) return error(400, v.error);

  const endings = endingList(parseJson(row.endings));
  if (endings.length >= MAX_ENDINGS) return error(400, "this space has too many recorded endings");

  // The fate the ending records is the roster's new truth. Anything not named
  // keeps the status it had, which is how a plant archived weeks ago stays
  // archived rather than being resurrected into this ending.
  const fates = new Map(v.value.plants.map((x) => [x.id, x.status]));
  const nextSurvey = {
    ...survey,
    strains: roster.map((s) => (fates.has(s?.id) ? { ...s, status: fates.get(s.id) } : s)),
  };

  await env.DB.prepare(
    "UPDATE grows SET survey = ?, endings = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(
    JSON.stringify(nextSurvey),
    JSON.stringify([...endings, v.value]),
    nowIso(), growId, user.id,
  ).run();

  return json({ ok: true, ending: v.value });
}

/**
 * DELETE /api/grows/:id/ending
 *
 * Takes back the most recent ending and puts every plant it touched back the
 * way it was. An append-only log with no way out is a trap: this flow marks
 * plants dead, and a mis-tap on that must be recoverable. Only the newest one
 * comes off, so the history underneath it cannot be rewritten.
 */
export async function undoGrowEnding(env, user, growId) {
  const row = await loadGrow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  const endings = endingList(parseJson(row.endings));
  if (!endings.length) return error(404, "this space has no recorded ending");

  const last = endings[endings.length - 1];
  const survey = parseJson(row.survey);
  const roster = Array.isArray(survey?.strains) ? survey.strains : [];
  const restore = new Map((last.plants ?? []).map((x) => [x.id, x.wasStatus || "growing"]));

  const nextSurvey = {
    ...survey,
    strains: roster.map((s) => (restore.has(s?.id) ? { ...s, status: restore.get(s.id) } : s)),
  };

  await env.DB.prepare(
    "UPDATE grows SET survey = ?, endings = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(
    JSON.stringify(nextSurvey),
    endings.length > 1 ? JSON.stringify(endings.slice(0, -1)) : null,
    nowIso(), growId, user.id,
  ).run();

  return json({ ok: true });
}
