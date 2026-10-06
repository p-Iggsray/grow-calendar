// The environment's stage history: every recorded "this plant moved to the
// next stage" event, which is what the calendar, day counter and phase labels
// are built from now that there are no predicted dates.
import { json, error } from "./util.js";
import { ownedGrowRow, ensurePlantLogSchema } from "./plants.js";
import { buildRunningTimeline, growAnchor } from "../src/lib/stageTimeline.js";
import { stageFromLogRow as stageFromRow } from "../src/lib/plantClock.js";

// Reading a stage out of a plant_log row is shared with the app, which builds
// one plant's history from its own log (src/lib/plantClock.js).
export { stageFromLogRow as stageFromRow } from "../src/lib/plantClock.js";

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

  const firstDate = growAnchor(row.created_at);
  const events = buildRunningTimeline(records, firstDate);
  // Each plant's own switches too, which is what its age in each stage and its
  // harvest window are read from (src/lib/plantClock.js).
  return json({ events, firstDate, plantRecords: records.filter((r) => r.plantId) });
}

// Internal: the same timeline for server-side consumers (push, report, MJ).
export async function loadStageTimeline(env, userId, growId) {
  try {
    await ensurePlantLogSchema(env);
    const grow = await env.DB.prepare(
      "SELECT created_at FROM grows WHERE id = ? AND user_id = ?"
    ).bind(growId, userId).first();
    const res = await env.DB.prepare(
      `SELECT date, body, detail, plant_id FROM plant_log
       WHERE user_id = ? AND grow_id = ? AND kind = 'stage'
       ORDER BY date ASC, id ASC`
    ).bind(userId, growId).all();
    const records = (res.results ?? [])
      .map((r) => ({ date: r.date, stage: stageFromRow(r), plantId: r.plant_id }))
      .filter((r) => r.stage);
    const firstDate = growAnchor(grow?.created_at);
    return {
      events: buildRunningTimeline(records, firstDate),
      firstDate,
      plantRecords: records.filter((r) => r.plantId),
    };
  } catch {
    return { events: [], firstDate: null, plantRecords: [] };
  }
}
