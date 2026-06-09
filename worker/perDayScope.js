// Grow-scoping for the per-day data layer.
//
// Historically grow_log, task_checkoffs, task_notes, day_notes and
// plan_day_overrides were keyed by (user_id, date) only, so a user running two
// concurrent grows whose calendars overlap saw the same per-day data on both.
// This module lazily migrates those tables to include grow_id in the primary
// key (backfilling existing rows to each user's earliest grow) and resolves the
// active grow for a request.

import { ensureGrowLogSchema } from "./growLog.js";

let _ready = false;

// Each rebuild only runs if the table is still missing its grow_id column.
// grow_id is backfilled to the user's earliest grow; rows for users with no
// grow are dropped (unreachable — the calendar requires a grow to render).
const REBUILDS = [
  {
    table: "grow_log",
    create: `CREATE TABLE grow_log_new (
      user_id INTEGER NOT NULL, grow_id TEXT NOT NULL, date TEXT NOT NULL,
      water_gal REAL, feed TEXT, temp_high REAL, temp_low REAL, humidity REAL,
      water_plants TEXT, training TEXT, plant_health TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, grow_id, date)
    )`,
    cols: "user_id, grow_id, date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health, updated_at",
    select: "t.user_id, $G, t.date, t.water_gal, t.feed, t.temp_high, t.temp_low, t.humidity, t.water_plants, t.training, t.plant_health, t.updated_at",
  },
  {
    table: "task_checkoffs",
    create: `CREATE TABLE task_checkoffs_new (
      user_id INTEGER NOT NULL, grow_id TEXT NOT NULL, date TEXT NOT NULL,
      task_index INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'done' CHECK(state IN ('done','skipped','blocked')),
      checked_at TEXT NOT NULL,
      PRIMARY KEY (user_id, grow_id, date, task_index)
    )`,
    cols: "user_id, grow_id, date, task_index, state, checked_at",
    select: "t.user_id, $G, t.date, t.task_index, t.state, t.checked_at",
  },
  {
    table: "task_notes",
    create: `CREATE TABLE task_notes_new (
      user_id INTEGER NOT NULL, grow_id TEXT NOT NULL, date TEXT NOT NULL,
      task_index INTEGER NOT NULL, note TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, grow_id, date, task_index)
    )`,
    cols: "user_id, grow_id, date, task_index, note, updated_at",
    select: "t.user_id, $G, t.date, t.task_index, t.note, t.updated_at",
  },
  {
    table: "day_notes",
    create: `CREATE TABLE day_notes_new (
      user_id INTEGER NOT NULL, grow_id TEXT NOT NULL, date TEXT NOT NULL,
      body TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, grow_id, date)
    )`,
    cols: "user_id, grow_id, date, body, updated_at",
    select: "t.user_id, $G, t.date, t.body, t.updated_at",
  },
  {
    table: "plan_day_overrides",
    create: `CREATE TABLE plan_day_overrides_new (
      user_id INTEGER NOT NULL, grow_id TEXT NOT NULL, date TEXT NOT NULL,
      payload TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, grow_id, date)
    )`,
    cols: "user_id, grow_id, date, payload, updated_at",
    select: "t.user_id, $G, t.date, t.payload, t.updated_at",
  },
];

// Earliest grow for a user, used both as the migration backfill target and as
// the fallback when a request doesn't carry an explicit growId.
const EARLIEST_GROW = "(SELECT g.id FROM grows g WHERE g.user_id = t.user_id ORDER BY g.created_at ASC LIMIT 1)";

async function columnExists(env, table, column) {
  const res = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return (res.results ?? []).some(c => c.name === column);
}

export async function ensurePerDayGrowScope(env) {
  if (_ready) return;

  // The backfill reads from `grows`; if it doesn't exist yet the grows feature
  // hasn't initialised, so retry on a later request rather than erroring.
  const grows = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'grows'",
  ).first();
  if (!grows) return;

  // grow_log gains its newer columns lazily; guarantee them before the rebuild
  // references them.
  await ensureGrowLogSchema(env);

  for (const r of REBUILDS) {
    if (await columnExists(env, r.table, "grow_id")) continue;
    const select = r.select.replace("$G", EARLIEST_GROW);
    try {
      await env.DB.batch([
        env.DB.prepare(r.create),
        env.DB.prepare(
          `INSERT INTO ${r.table}_new (${r.cols}) SELECT ${select} FROM ${r.table} t ` +
          `WHERE EXISTS (SELECT 1 FROM grows g WHERE g.user_id = t.user_id)`,
        ),
        env.DB.prepare(`DROP TABLE ${r.table}`),
        env.DB.prepare(`ALTER TABLE ${r.table}_new RENAME TO ${r.table}`),
      ]);
    } catch {
      // A concurrent request may have migrated it first; if grow_id now exists
      // we're fine, otherwise a later request retries.
      if (!(await columnExists(env, r.table, "grow_id"))) return;
    }
  }
  _ready = true;
}

// Earliest grow id for a user (fallback when no explicit growId is supplied).
export async function firstGrowId(env, userId) {
  const row = await env.DB.prepare(
    "SELECT id FROM grows WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
  ).bind(userId).first();
  return row?.id ?? null;
}

// Resolve the grow a per-day request targets: the explicit ?growId= param when
// present (rows are still user_id-scoped, so this can't reach another user's
// data), otherwise the user's earliest grow.
export async function resolveGrowId(env, user, url) {
  const q = url.searchParams.get("growId");
  if (q) return q;
  return firstGrowId(env, user.id);
}
