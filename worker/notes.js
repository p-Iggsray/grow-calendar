import { json, error, nowIso } from "./util.js";
import { currentUser } from "./auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY_LEN = 20000;

export async function getNote(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const row = await env.DB.prepare(
    "SELECT body FROM day_notes WHERE user_id = ? AND date = ?",
  ).bind(user.id, date).first();

  return json({ date, body: row?.body ?? "" });
}

export async function putNote(request, env, date) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }

  if (typeof body?.body !== "string") return error(400, "body must be a string");
  const text = body.body;
  if (text.length > MAX_BODY_LEN) return error(400, `body exceeds ${MAX_BODY_LEN} characters`);

  // An empty/whitespace-only note removes the row instead of storing a blank record.
  if (text.trim() === "") {
    await env.DB.prepare(
      "DELETE FROM day_notes WHERE user_id = ? AND date = ?",
    ).bind(user.id, date).run();
    return json({ date, body: "" });
  }

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO day_notes (user_id, date, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  ).bind(user.id, date, text, now).run();

  return json({ date, body: text });
}
