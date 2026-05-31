// @ts-check
import { json, error, nowIso, safeJsonBounded } from "./util.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const MAX_CHECKOFFS_REQUEST_BYTES = 8 * 1024;
const VALID_STATES = new Set(["done", "skipped", "blocked"]);

// ─── Internal read helpers ───────────────────────────────────────────────────

/** Returns { taskIndex: state } for all resolved tasks on a day. */
export async function readTaskStates(env, userId, date) {
  const result = await env.DB.prepare(
    "SELECT task_index, state FROM task_checkoffs WHERE user_id = ? AND date = ?",
  ).bind(userId, date).all();
  const states = {};
  for (const r of result.results || []) states[String(r.task_index)] = r.state;
  return states;
}

/** Returns sorted int[] of task indices that are specifically "done". Used by MJ. */
export async function readCheckoffs(env, userId, date) {
  const states = await readTaskStates(env, userId, date);
  return Object.entries(states)
    .filter(([, s]) => s === "done")
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
}

// ─── Internal write helpers ──────────────────────────────────────────────────

/** Replaces ALL task states for a date with the provided map. */
export async function writeTaskStates(env, userId, date, taskStates) {
  const now = nowIso();
  const stmts = [
    env.DB.prepare("DELETE FROM task_checkoffs WHERE user_id = ? AND date = ?").bind(userId, date),
  ];
  for (const [idx, state] of Object.entries(taskStates)) {
    if (VALID_STATES.has(state)) {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO task_checkoffs (user_id, date, task_index, state, checked_at) VALUES (?, ?, ?, ?, ?)",
        ).bind(userId, date, Number(idx), state, now),
      );
    }
  }
  await env.DB.batch(stmts);
}

/**
 * Updates only the "done" states for a date, preserving any "skipped"/"blocked" rows.
 * Used by MJ's set_tasks_done tool so it doesn't clobber states set by the user in the UI.
 */
export async function writeCheckoffs(env, userId, date, doneIndices) {
  const now = nowIso();
  const stmts = [
    // Delete only "done" rows; skipped/blocked rows are untouched.
    env.DB.prepare(
      "DELETE FROM task_checkoffs WHERE user_id = ? AND date = ? AND state = 'done'",
    ).bind(userId, date),
  ];
  for (const idx of doneIndices) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO task_checkoffs (user_id, date, task_index, state, checked_at) VALUES (?, ?, ?, 'done', ?)",
      ).bind(userId, date, idx, now),
    );
  }
  await env.DB.batch(stmts);
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function getCheckoffs(env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  const taskStates = await readTaskStates(env, user.id, date);
  const checked = Object.entries(taskStates)
    .filter(([, s]) => s === "done")
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);
  return json({ date, checked, taskStates });
}

/**
 * Returns checkoff *counts* per date inside a month, for the calendar ring.
 * All resolved states (done + skipped + blocked) count toward the total.
 */
export async function getMonthCheckoffs(env, user, month) {
  if (!MONTH_RE.test(month)) return error(400, "invalid month format, expected YYYY-MM");
  const result = await env.DB.prepare(
    "SELECT date, COUNT(*) AS n FROM task_checkoffs " +
    "WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY date",
  ).bind(user.id, month).all();
  const counts = {};
  for (const row of (result.results || [])) counts[row.date] = Number(row.n);
  return json({ month, counts });
}

/**
 * PUT /api/checkoffs/:date
 * Body: { taskStates: { "0": "done", "1": "skipped" } }
 *   — or legacy — { checked: [0, 1] }  (treated as all "done")
 */
export async function putCheckoffs(request, env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  const parsed = await safeJsonBounded(request, MAX_CHECKOFFS_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  let rawStates;
  if (body?.taskStates && typeof body.taskStates === "object" && !Array.isArray(body.taskStates)) {
    rawStates = body.taskStates;
  } else if (Array.isArray(body?.checked)) {
    rawStates = Object.fromEntries(body.checked.map(n => [String(n), "done"]));
  } else {
    return error(400, "body must contain taskStates object or checked array");
  }

  const valid = {};
  for (const [k, v] of Object.entries(rawStates)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && idx < 100 && VALID_STATES.has(v)) {
      valid[String(idx)] = v;
    }
  }

  await writeTaskStates(env, user.id, date, valid);
  const checked = Object.entries(valid).filter(([, s]) => s === "done").map(([k]) => Number(k)).sort((a, b) => a - b);
  return json({ date, checked, taskStates: valid });
}
