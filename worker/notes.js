import { json, error, nowIso, safeJsonBounded } from "./util.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_NOTE_LEN = 20000;
// JSON wrapper overhead is tiny; allow ~4x the raw note length as headroom for
// escape sequences (a worst-case 20k note of nothing but quotes ~= 40k JSON).
const MAX_NOTE_REQUEST_BYTES = MAX_NOTE_LEN * 4 + 256;

export async function readNote(env, userId, date) {
  const row = await env.DB.prepare(
    "SELECT body FROM day_notes WHERE user_id = ? AND date = ?",
  ).bind(userId, date).first();
  return row?.body ?? "";
}

export async function writeNote(env, userId, date, body) {
  const text = body ?? "";
  if (text.trim() === "") {
    await env.DB.prepare(
      "DELETE FROM day_notes WHERE user_id = ? AND date = ?",
    ).bind(userId, date).run();
    return "";
  }
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO day_notes (user_id, date, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  ).bind(userId, date, text, now).run();
  return text;
}

export async function getNote(env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  return json({ date, body: await readNote(env, user.id, date) });
}

export async function putNote(request, env, user, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const parsed = await safeJsonBounded(request, MAX_NOTE_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  if (typeof body?.body !== "string") return error(400, "body must be a string");
  const text = body.body;
  if (text.length > MAX_NOTE_LEN) return error(400, `body exceeds ${MAX_NOTE_LEN} characters`);

  const stored = await writeNote(env, user.id, date, text);
  return json({ date, body: stored });
}
