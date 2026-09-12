// @ts-check
// Archiving a grow space, and the only delete left in the app.
//
// `grows.archived_at` is the whole of it: a timestamp, set when the space is
// put away and cleared when it comes back. It sits alongside `status` rather
// than inside it, so a harvested space stays harvested while it is archived and
// is still harvested when it comes out.
//
// Nothing here removes a space the grower archived. Eviction does, and only to
// make room under the caps in src/lib/archive.js, only ever the spaces archived
// longest ago, and only after the app has named them and been told to go ahead.

import { json, error, nowIso, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import { ARCHIVE_CAPS, planEviction } from "../src/lib/archive.js";

// Every table a space writes to. Archiving keeps all of them; eviction drops
// all of them together, which is what makes a purge complete rather than
// leaving orphan rows keyed to a grow that no longer exists.
//
// `text` names the columns worth measuring. Everything else is dates, numbers
// and ids, covered by the flat per-row estimate below.
const GROW_TABLES = [
  { table: "task_checkoffs",     text: [] },
  { table: "task_notes",         text: ["note"] },
  { table: "day_notes",          text: ["body"] },
  { table: "plan_day_overrides", text: ["payload"] },
  { table: "grow_log",           text: ["feed", "water_plants", "training", "plant_health"] },
  { table: "env_readings",       text: [] },
  { table: "plant_log",          text: ["body", "detail"] },
  { table: "grow_events",        text: ["title", "notes"] },
  // Photos are base64 data URLs and are essentially the whole number.
  { table: "journal_photos",     text: ["data", "thumb"] },
];

// Keys, dates and numbers on a row, none of which the text sum sees.
const ROW_OVERHEAD = 64;

function lengthSum(cols) {
  if (!cols.length) return "0";
  return cols.map((c) => `LENGTH(COALESCE(${c}, ''))`).join(" + ");
}

/**
 * Bytes each of this user's grows occupies, as `{ [growId]: bytes }`.
 *
 * One grouped query per table rather than one per grow, so the cost does not
 * climb with how many spaces are kept. A table this database has never created
 * simply contributes nothing.
 */
export async function bytesByGrow(env, userId) {
  const totals = {};
  const add = (growId, n) => {
    if (!growId) return;
    totals[growId] = (totals[growId] ?? 0) + n;
  };

  for (const { table, text } of GROW_TABLES) {
    try {
      const res = await env.DB.prepare(
        `SELECT grow_id, COUNT(*) AS rows_n, SUM(${lengthSum(text)}) AS chars
         FROM ${table} WHERE user_id = ? GROUP BY grow_id`
      ).bind(userId).all();
      for (const r of res.results ?? []) {
        add(r.grow_id, (Number(r.chars) || 0) + (Number(r.rows_n) || 0) * ROW_OVERHEAD);
      }
    } catch { /* table not created in this database yet */ }
  }

  // The space's own row: its survey and lifecycle are JSON and not small.
  try {
    const res = await env.DB.prepare(
      `SELECT id, LENGTH(COALESCE(survey, '')) + LENGTH(COALESCE(generated_plan, ''))
              + LENGTH(COALESCE(phase_overrides, '')) + LENGTH(COALESCE(event_rules, ''))
              + LENGTH(COALESCE(lifecycle, '')) + LENGTH(COALESCE(config, '')) AS chars
       FROM grows WHERE user_id = ?`
    ).bind(userId).all();
    for (const r of res.results ?? []) add(r.id, (Number(r.chars) || 0) + ROW_OVERHEAD);
  } catch { /* no grows table yet */ }

  return totals;
}

/** The archive as it stands: its spaces oldest-archived first, and the caps. */
export async function readArchive(env, userId) {
  const [rows, bytes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, display_name, status, archived_at, created_at
       FROM grows WHERE user_id = ? AND archived_at IS NOT NULL
       ORDER BY archived_at ASC, created_at ASC`
    ).bind(userId).all(),
    bytesByGrow(env, userId),
  ]);
  const spaces = (rows.results ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    status: r.status,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    bytes: bytes[r.id] ?? 0,
  }));
  return { spaces, bytes, caps: ARCHIVE_CAPS };
}

/**
 * Remove a grow and everything keyed to it. The only delete in the app, used
 * by eviction alone. Deletes the child rows first so a failure part-way leaves
 * a space that still exists rather than rows nothing owns.
 */
export async function purgeGrow(env, userId, growId) {
  for (const { table } of GROW_TABLES) {
    try {
      await env.DB.prepare(
        `DELETE FROM ${table} WHERE user_id = ? AND grow_id = ?`
      ).bind(userId, growId).run();
    } catch (e) {
      logError("archive-purge-table", { table, message: String(e?.message) });
    }
  }
  await env.DB.prepare(
    "DELETE FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).run();
}

async function growRow(env, userId, growId) {
  return env.DB.prepare(
    "SELECT id, display_name, archived_at FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
}

/** GET /api/archive - what is in the archive and how full it is. */
export async function getArchive(env, user) {
  const { spaces, caps } = await readArchive(env, user.id);
  return json({ spaces, caps });
}

/**
 * POST /api/grows/:id/archive
 *
 * Answers before it acts. When the archive has no room, the first call returns
 * 409 `archive_full` naming exactly which spaces would be dropped; the app
 * shows them and calls again with `{ evict: true }` only if the grower agrees.
 */
export async function archiveGrow(request, env, user, growId) {
  const row = await growRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  if (row.archived_at) return json({ ok: true, archivedAt: row.archived_at, evicted: [] });

  // The last space standing has nowhere to put you back from: the app would
  // drop into first-time setup with no list to reach the archive through.
  const live = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM grows WHERE user_id = ? AND archived_at IS NULL"
  ).bind(user.id).first();
  if ((live?.n ?? 0) <= 1) {
    return json(
      { error: "This is your only space, so there would be nothing left to come back to. Create another one first.", code: "last_space" },
      { status: 409 },
    );
  }

  let body = {};
  { const p = await safeJsonBounded(request, 4096); if (p.ok) body = p.data ?? {}; }

  const { spaces, bytes, caps } = await readArchive(env, user.id);
  const incoming = { id: growId, displayName: row.display_name, bytes: bytes[growId] ?? 0 };
  const evict = planEviction(spaces, incoming, caps);

  if (evict.length && body?.evict !== true) {
    return json({
      error: "The archive is full.",
      code: "archive_full",
      evict: evict.map((g) => ({ id: g.id, displayName: g.displayName, archivedAt: g.archivedAt, bytes: g.bytes })),
      incoming,
      archive: { spaces, caps },
    }, { status: 409 });
  }

  for (const g of evict) await purgeGrow(env, user.id, g.id);

  const now = nowIso();
  await env.DB.prepare(
    "UPDATE grows SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(now, now, growId, user.id).run();

  return json({
    ok: true,
    archivedAt: now,
    evicted: evict.map((g) => ({ id: g.id, displayName: g.displayName })),
  });
}

/** POST /api/grows/:id/unarchive - out of the archive, exactly as it went in. */
export async function unarchiveGrow(env, user, growId) {
  const row = await growRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE grows SET archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(now, growId, user.id).run();
  return json({ ok: true, archivedAt: null });
}
