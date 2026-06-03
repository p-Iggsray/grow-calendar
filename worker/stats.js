// @ts-check
import { json } from "./util.js";

export async function getStats(env, user) {
  const [logRow, checkoffRow, notesRow, mediaRow] = await Promise.all([
    env.DB.prepare(`
      SELECT
        ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
        MIN(temp_low)  AS temp_min,
        MAX(temp_high) AS temp_max,
        COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days
      FROM grow_log
      WHERE user_id = ?
    `).bind(user.id).first(),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN state = 'done'    THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN state = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN state = 'blocked' THEN 1 ELSE 0 END) AS blocked
      FROM task_checkoffs
      WHERE user_id = ?
    `).bind(user.id).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM day_notes
      WHERE user_id = ? AND body != ''
    `).bind(user.id).first(),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN kind = 'photo' THEN 1 ELSE 0 END) AS photos,
        SUM(CASE WHEN kind = 'audio' THEN 1 ELSE 0 END) AS audio
      FROM media
      WHERE user_id = ?
    `).bind(user.id).first(),
  ]);

  return json({
    log: {
      totalWater: logRow?.total_water ?? 0,
      tempMin:    logRow?.temp_min    ?? null,
      tempMax:    logRow?.temp_max    ?? null,
      feedDays:   logRow?.feed_days   ?? 0,
    },
    checkoffs: {
      total:   checkoffRow?.total   ?? 0,
      done:    checkoffRow?.done    ?? 0,
      skipped: checkoffRow?.skipped ?? 0,
      blocked: checkoffRow?.blocked ?? 0,
    },
    notes: { count: notesRow?.count ?? 0 },
    media: {
      total:  mediaRow?.total  ?? 0,
      photos: mediaRow?.photos ?? 0,
      audio:  mediaRow?.audio  ?? 0,
    },
  });
}
