import { json, error, nowIso, safeJsonBounded } from "./util.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CHECKOFFS_REQUEST_BYTES = 4 * 1024;

export async function readCheckoffs(env, userId, date) {
  const result = await env.DB.prepare(
    "SELECT task_index FROM task_checkoffs WHERE user_id = ? AND date = ? ORDER BY task_index",
  ).bind(userId, date).all();
  return (result.results || []).map(r => r.task_index);
}

export async function writeCheckoffs(env, userId, date, checkedIndices) {
  const now = nowIso();
  const statements = [
    env.DB.prepare("DELETE FROM task_checkoffs WHERE user_id = ? AND date = ?").bind(userId, date),
  ];
  for (const idx of checkedIndices) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO task_checkoffs (user_id, date, task_index, checked_at) VALUES (?, ?, ?, ?)",
      ).bind(userId, date, idx, now),
    );
  }
  await env.DB.batch(statements);
}

export async function getCheckoffs(env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  return json({ date, checked: await readCheckoffs(env, user.id, date) });
}

export async function putCheckoffs(request, env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const parsed = await safeJsonBounded(request, MAX_CHECKOFFS_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  if (!body || !Array.isArray(body.checked)) return error(400, "checked must be an array of task indexes");
  const checked = body.checked
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n >= 0 && n < 100);

  await writeCheckoffs(env, user.id, date, checked);
  return json({ date, checked });
}
