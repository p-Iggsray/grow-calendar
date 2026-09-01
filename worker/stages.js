// The environment's stage history: every recorded "this plant moved to the
// next stage" event, which is what the calendar, day counter and phase labels
// are built from now that there are no predicted dates.
import { json, error } from "./util.js";
import { ownedGrowRow, ensurePlantLogSchema } from "./plants.js";
import { buildRunningTimeline, growAnchor, STAGE_ORDER } from "../src/lib/stageTimeline.js";

const LABEL_TO_STAGE = Object.fromEntries(
  STAGE_ORDER.map((s) => [s.toLowerCase(), s]),
);

// Pure: read the stage out of a plant_log row. New rows carry it in detail;
// older ones only have the display body ("Stage -> Flowering"), so fall back
// to reading the label off the end.
export function stageFromRow(row) {
  if (row?.detail) {
    try {
      const parsed = typeof row.detail === "string" ? JSON.parse(row.detail) : row.detail;
      const s = String(parsed?.stage ?? "").toLowerCase();
      if (LABEL_TO_STAGE[s]) return LABEL_TO_STAGE[s];
    } catch { /* fall through to the body */ }
  }
  const body = String(row?.body ?? "");
  const tail = body.split(/[>→]/).pop();        // after "->" or an arrow
  const key = String(tail ?? "").trim().toLowerCase();
  return LABEL_TO_STAGE[key] ?? null;
}

// GET /api/grows/:id/stages -> the running timeline plus the space's day 0.
export async function getStageTimeline(env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);

  const res = await env.DB.prepare(
    `SELECT date, body, detail, plant_id FROM plant_log
     WHERE user_id = ? AND grow_id = ? AND kind = 'stage'
     ORDER BY date ASC, id ASC`
  ).bind(user.id, growId).all();

  const records = (res.results ?? [])
    .map((r) => ({ date: r.date, stage: stageFromRow(r), plantId: r.plant_id }))
    .filter((r) => r.stage);

  const events = buildRunningTimeline(records);
  const firstDate = growAnchor(row.created_at, records.length ? records[0].date : null);
  return json({ events, firstDate });
}

// Internal: the same timeline for server-side consumers (push, report, MJ).
export async function loadStageTimeline(env, userId, growId) {
  try {
    await ensurePlantLogSchema(env);
    const grow = await env.DB.prepare(
      "SELECT created_at FROM grows WHERE id = ? AND user_id = ?"
    ).bind(growId, userId).first();
    const res = await env.DB.prepare(
      `SELECT date, body, detail FROM plant_log
       WHERE user_id = ? AND grow_id = ? AND kind = 'stage'
       ORDER BY date ASC, id ASC`
    ).bind(userId, growId).all();
    const records = (res.results ?? [])
      .map((r) => ({ date: r.date, stage: stageFromRow(r) }))
      .filter((r) => r.stage);
    return {
      events: buildRunningTimeline(records),
      firstDate: growAnchor(grow?.created_at, records.length ? records[0].date : null),
    };
  } catch {
    return { events: [], firstDate: null };
  }
}
