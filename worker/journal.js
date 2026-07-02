// @ts-check
import { json, error } from "./util.js";
import { ensureGrowLogSchema, isLogFilled, rowToEntry } from "./growLog.js";
import { readNote } from "./notes.js";
import { ownedGrowRow, parseSurvey, ensurePlantLogSchema } from "./plants.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function plantNameMap(survey) {
  const map = {};
  for (const p of survey?.strains ?? []) {
    if (p?.id) map[p.id] = p.name || "Plant";
  }
  return map;
}

// Pure: shape a plant_log DB row for the journal (parsed detail + plant name).
export function journalPlantEntry(row, names) {
  let detail = null;
  if (row.detail) {
    try { detail = JSON.parse(row.detail); } catch { detail = null; }
  }
  return {
    id: row.id,
    plantId: row.plant_id,
    plantName: names[row.plant_id] ?? "Plant",
    date: row.date,
    kind: row.kind || "note",
    detail,
    body: row.body ?? "",
    height: row.height ?? null,
    height_unit: row.height_unit ?? null,
    health: row.health ?? null,
  };
}

// Pure: build the month index from raw query results. A day appears when it
// holds ANY journal content: a filled grow log, a day note, or plant entries.
export function buildMonthIndex(logRows, noteRows, plantRows) {
  const days = {};
  const at = (d) => (days[d] ??= { log: false, note: false, plants: 0 });
  for (const r of logRows ?? []) {
    if (isLogFilled(r)) at(r.date).log = true;
  }
  for (const r of noteRows ?? []) at(r.date).note = true;
  for (const r of plantRows ?? []) at(r.date).plants = r.n;
  return days;
}

// GET /api/journal/:date -> everything recorded on one day of a grow, in one
// round trip: the daily grow log, the day note, and every plant's log entries.
export async function getJournalDay(env, user, growId, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const names = plantNameMap(parseSurvey(row.survey));

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);

  const [logRow, note, plantRes] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?"
    ).bind(user.id, growId, date).first(),
    readNote(env, user.id, growId, date).catch(() => ""),
    env.DB.prepare(
      `SELECT id, plant_id, date, kind, detail, body, height, height_unit, health
       FROM plant_log WHERE user_id = ? AND grow_id = ? AND date = ?
       ORDER BY plant_id, id ASC`
    ).bind(user.id, growId, date).all(),
  ]);

  return json({
    date,
    log: logRow && isLogFilled(logRow) ? rowToEntry(logRow) : null,
    note: note || "",
    plantEntries: (plantRes.results ?? []).map((r) => journalPlantEntry(r, names)),
  });
}

// GET /api/journal/month?month=YYYY-MM -> { month, days: { date: {log, note, plants} } }
// Powers the journal's jump-to-day strip: which days actually hold content.
export async function getJournalMonth(env, user, growId, month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return error(400, "month must be YYYY-MM");
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);
  const like = month + "-%";

  const [logs, notes, plants] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date LIKE ?"
    ).bind(user.id, growId, like).all(),
    env.DB.prepare(
      "SELECT date FROM day_notes WHERE user_id = ? AND grow_id = ? AND date LIKE ?"
    ).bind(user.id, growId, like).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      "SELECT date, COUNT(*) AS n FROM plant_log WHERE user_id = ? AND grow_id = ? AND date LIKE ? GROUP BY date"
    ).bind(user.id, growId, like).all(),
  ]);

  return json({
    month,
    days: buildMonthIndex(logs.results, notes.results, plants.results),
  });
}
