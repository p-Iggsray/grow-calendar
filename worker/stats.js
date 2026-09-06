// @ts-check
import { json } from "./util.js";
import { displayUnit } from "../src/lib/waterUnits.js";

// Stats are scoped to a single grow so multi-grow users don't see every grow's
// water/temps summed together. The StatsScreen shows the active grow's
// profile (location/strains) alongside these numbers, so they must match.
export async function getStats(env, user, growId) {
  const [logRow, notesRow, waterRows] = await Promise.all([
    env.DB.prepare(`
      SELECT
        ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
        MIN(temp_low)  AS temp_min,
        MAX(temp_high) AS temp_max,
        COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days
      FROM grow_log
      WHERE user_id = ? AND grow_id = ?
    `).bind(user.id, growId).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM day_notes
      WHERE user_id = ? AND grow_id = ? AND body != ''
    `).bind(user.id, growId).first(),
    // Which units this grow was actually watered in, so a season measured in
    // litres is not read back to the grower in gallons.
    env.DB.prepare(`
      SELECT water_plants
      FROM grow_log
      WHERE user_id = ? AND grow_id = ? AND water_plants IS NOT NULL AND water_plants != ''
    `).bind(user.id, growId).all(),
  ]);

  const everyRow = [];
  for (const r of waterRows?.results ?? []) {
    try {
      const parsed = JSON.parse(r.water_plants);
      if (Array.isArray(parsed)) everyRow.push(...parsed);
    } catch { /* a day that cannot be parsed simply has no say in the unit */ }
  }

  return json({
    log: {
      totalWater: logRow?.total_water ?? 0,
      // null when nothing says otherwise: the client then uses the unit in hand.
      waterUnit:  displayUnit(everyRow, null),
      tempMin:    logRow?.temp_min    ?? null,
      tempMax:    logRow?.temp_max    ?? null,
      feedDays:   logRow?.feed_days   ?? 0,
    },
    notes: { count: notesRow?.count ?? 0 },
  });
}
