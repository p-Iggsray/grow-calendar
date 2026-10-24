// @ts-check
// One-time removal of tables and columns earlier versions kept and this one
// no longer reads. Run on the owner's next visit rather than as a migration
// file, because nothing in the deploy applies migrations to the live database.
//
// Same shape as the strain privacy sweep in strains.js: the marker lives in the
// database, and the in-isolate flag is set first, so a failure costs one
// request rather than every request after it.

import { logError } from "./log.js";

const DROP_MARKER = "retired_tables_dropped_v1";

export const RETIRED_TABLES = [
  "mj_conversations",
  "mj_usage",
  "mj_model_usage",
  "plan_gen_usage",
  "read_usage",
  "strain_profile",
];

export const RETIRED_COLUMNS = [
  { table: "grow_log", column: "read_from" },
];

/** Pure: the statements that remove every retired table and column. */
export function retiredTableStatements() {
  return [
    ...RETIRED_TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`),
    ...RETIRED_COLUMNS.map(({ table, column }) => `ALTER TABLE ${table} DROP COLUMN ${column}`),
  ];
}

let _dropped = false;

export async function ensureRetiredTablesDropped(env) {
  if (_dropped) return;
  _dropped = true;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    ).run();
    const done = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = ?"
    ).bind(DROP_MARKER).first();
    if (done) return;

    // One at a time: a column that was never added makes its DROP fail, and
    // that must not stop the rest.
    for (const sql of retiredTableStatements()) {
      try { await env.DB.prepare(sql).run(); } catch { /* already gone */ }
    }
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    ).bind(DROP_MARKER, new Date().toISOString()).run();
  } catch (err) {
    logError("retired-tables-drop", { message: String(err?.message ?? err) });
  }
}
