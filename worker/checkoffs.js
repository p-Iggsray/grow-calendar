import { json, error, nowIso } from "./util.js";
import { currentUser } from "./auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getCheckoffs(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const result = await env.DB.prepare(
    "SELECT task_index FROM task_checkoffs WHERE user_id = ? AND date = ? ORDER BY task_index",
  ).bind(user.id, date).all();

  const checked = (result.results || []).map(r => r.task_index);
  return json({ date, checked });
}

export async function putCheckoffs(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }

  if (!Array.isArray(body.checked)) return error(400, "checked must be an array of task indexes");
  const checked = body.checked
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n >= 0 && n < 100);

  const now = nowIso();
  const statements = [
    env.DB.prepare("DELETE FROM task_checkoffs WHERE user_id = ? AND date = ?").bind(user.id, date),
  ];
  for (const idx of checked) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO task_checkoffs (user_id, date, task_index, checked_at) VALUES (?, ?, ?, ?)",
      ).bind(user.id, date, idx, now),
    );
  }
  await env.DB.batch(statements);

  return json({ date, checked });
}
