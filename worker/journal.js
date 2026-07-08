// @ts-check
import { json, error } from "./util.js";
import { ensureGrowLogSchema, isLogFilled, rowToEntry } from "./growLog.js";
import { readNote } from "./notes.js";
import { ownedGrowRow, parseSurvey, ensurePlantLogSchema } from "./plants.js";
import { htmlToPlainText } from "../src/lib/richText.js";
import { getWeatherForDay, coordsFromSurvey, locKey } from "./weatherDays.js";

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
  const survey = parseSurvey(row.survey);
  const names = plantNameMap(survey);

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);

  // Observed weather documents the day automatically for EVERY grow with a
  // location on file (indoor growers still care what's happening outside).
  // Best-effort: null hides the card; hasWeatherLocation tells the client
  // whether to hint that a location is missing.
  const coords = coordsFromSurvey(survey);
  const weatherPromise = coords ? getWeatherForDay(env, coords.lat, coords.lon, date) : Promise.resolve(null);

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
    weather: await weatherPromise,
    hasWeatherLocation: Boolean(coords),
  });
}

// Pure: a short single-line excerpt for timeline cards and search results.
// Rich entries are flattened to their words first.
export function makeExcerpt(body, max = 240) {
  const text = htmlToPlainText(String(body ?? "")).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Pure: merge per-table query results into day summaries, newest first.
// logRows are raw grow_log rows; noteRows carry {date, body}; plantRows carry
// {date, n, kinds} (kinds = comma-joined distinct entry kinds for the day).
export function buildTimelineDays(logRows, noteRows, plantRows) {
  const byDate = new Map();
  const at = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, log: null, noteExcerpt: "", plants: 0, plantKinds: [] });
    return byDate.get(d);
  };
  for (const r of logRows ?? []) {
    if (!isLogFilled(r)) continue;
    const e = rowToEntry(r);
    at(r.date).log = {
      water_gal: e.water_gal, feed: e.feed,
      temp_high: e.temp_high, temp_low: e.temp_low, humidity: e.humidity,
      waterings: e.water_plants.length, trainings: e.training.length, healthChecks: e.plant_health.length,
    };
  }
  for (const r of noteRows ?? []) {
    if ((r.body ?? "").trim()) at(r.date).noteExcerpt = makeExcerpt(r.body);
  }
  for (const r of plantRows ?? []) {
    const d = at(r.date);
    d.plants = r.n;
    d.plantKinds = String(r.kinds ?? "").split(",").filter(Boolean);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Escape LIKE wildcards in user-supplied search text.
export function escapeLike(q) {
  return String(q ?? "").replace(/[\\%_]/g, (c) => "\\" + c);
}

// GET /api/journal/weather/:date -> just the day's weather (used by the day
// view's Journal tab, which loads its other data through separate hooks).
export async function getJournalWeather(env, user, growId, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const coords = coordsFromSurvey(parseSurvey(row.survey));
  const weather = coords ? await getWeatherForDay(env, coords.lat, coords.lon, date) : null;
  return json({ date, weather, hasWeatherLocation: Boolean(coords) });
}

// Pure: fold cached weather rows onto timeline day summaries.
export function attachWeather(days, wxByDate) {
  for (const d of days ?? []) {
    const w = wxByDate?.[d.date];
    if (w && (w.high != null || w.low != null || w.humidity != null)) {
      d.weather = { high: w.high ?? null, low: w.low ?? null, humidity: w.humidity ?? null };
    }
  }
  return days;
}

// GET /api/journal/timeline?before=YYYY-MM-DD&limit=N -> the journal's home
// feed: every day that holds content, newest first, paged by date cursor.
// Also returns totalDays (distinct journaled days) for the stats row.
export async function getJournalTimeline(env, user, growId, before, limitRaw) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const cursor = DATE_RE.test(before || "") ? before : "9999-12-31";
  const limit = Math.min(Math.max(Number(limitRaw) || 30, 1), 90);
  // Over-fetch per table: a day may appear in one table only, so each table
  // needs enough rows on its own to fill a page of merged days.
  const fetchN = limit + 30;

  await ensureGrowLogSchema(env);
  await ensurePlantLogSchema(env);

  const [logs, notes, plants, total] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date < ? ORDER BY date DESC LIMIT ?"
    ).bind(user.id, growId, cursor, fetchN).all(),
    env.DB.prepare(
      "SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND date < ? ORDER BY date DESC LIMIT ?"
    ).bind(user.id, growId, cursor, fetchN).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT date, COUNT(*) AS n, GROUP_CONCAT(DISTINCT kind) AS kinds
       FROM plant_log WHERE user_id = ? AND grow_id = ? AND date < ?
       GROUP BY date ORDER BY date DESC LIMIT ?`
    ).bind(user.id, growId, cursor, fetchN).all(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT date) AS n FROM (
         SELECT date FROM grow_log WHERE user_id = ? AND grow_id = ?
         UNION SELECT date FROM day_notes WHERE user_id = ? AND grow_id = ?
         UNION SELECT date FROM plant_log WHERE user_id = ? AND grow_id = ?
       )`
    ).bind(user.id, growId, user.id, growId, user.id, growId).first().catch(() => ({ n: 0 })),
  ]);

  const merged = buildTimelineDays(logs.results, notes.results, plants.results);
  const days = merged.slice(0, limit);

  // Fold each day's weather onto its card. Reads the shared cache; touching
  // today first keeps the recent window fresh (and backfills the last week).
  const coords = coordsFromSurvey(parseSurvey(row.survey));
  if (coords && days.length > 0) {
    try {
      await getWeatherForDay(env, coords.lat, coords.lon, new Date().toISOString().slice(0, 10));
      const placeholders = days.map(() => "?").join(",");
      const wres = await env.DB.prepare(
        `SELECT date, high, low, humidity FROM weather_days WHERE loc = ? AND date IN (${placeholders})`
      ).bind(locKey(coords.lat, coords.lon), ...days.map(d => d.date)).all();
      attachWeather(days, Object.fromEntries((wres.results ?? []).map(r => [r.date, r])));
    } catch { /* the timeline works fine without weather */ }
  }

  const hasMore = merged.length > limit
    // Any source table hitting its fetch cap may hide older days.
    || (logs.results ?? []).length >= fetchN
    || (notes.results ?? []).length >= fetchN
    || (plants.results ?? []).length >= fetchN;

  return json({
    days,
    totalDays: total?.n ?? 0,
    nextBefore: days.length ? days[days.length - 1].date : null,
    hasMore: hasMore && days.length > 0,
  });
}

// GET /api/journal/search?q= -> days whose note or plant entries mention the
// text, newest first, with a match excerpt for each.
export async function searchJournal(env, user, growId, qRaw) {
  const q = String(qRaw ?? "").trim().slice(0, 80);
  if (q.length < 2) return error(400, "type at least 2 characters to search");
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const names = plantNameMap(parseSurvey(row.survey));
  const like = `%${escapeLike(q)}%`;

  await ensurePlantLogSchema(env);
  const [notes, entries, feeds] = await Promise.all([
    env.DB.prepare(
      `SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND body LIKE ? ESCAPE '\\'
       ORDER BY date DESC LIMIT 40`
    ).bind(user.id, growId, like).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT date, plant_id, kind, body FROM plant_log
       WHERE user_id = ? AND grow_id = ? AND body LIKE ? ESCAPE '\\'
       ORDER BY date DESC LIMIT 40`
    ).bind(user.id, growId, like).all(),
    env.DB.prepare(
      `SELECT date, feed FROM grow_log WHERE user_id = ? AND grow_id = ? AND feed LIKE ? ESCAPE '\\'
       ORDER BY date DESC LIMIT 40`
    ).bind(user.id, growId, like).all(),
  ]);

  const byDate = new Map();
  const add = (date, snippet) => {
    if (!byDate.has(date)) byDate.set(date, { date, snippets: [] });
    const s = byDate.get(date).snippets;
    if (s.length < 3) s.push(snippet);
  };
  for (const r of notes.results ?? []) add(r.date, { source: "note", text: makeExcerpt(r.body, 140) });
  for (const r of entries.results ?? []) {
    add(r.date, { source: "plant", plant: names[r.plant_id] ?? "Plant", kind: r.kind || "note", text: makeExcerpt(r.body, 140) });
  }
  for (const r of feeds.results ?? []) add(r.date, { source: "feed", text: makeExcerpt(r.feed, 140) });

  const results = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
  return json({ q, results });
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
