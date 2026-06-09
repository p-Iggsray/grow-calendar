// @ts-check
import { json, error, nowIso, safeJsonBounded } from "./util.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_TASK_NOTE_LEN = 280;

export async function getTaskNotes(env, user, growId, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  const result = await env.DB.prepare(
    "SELECT task_index, note FROM task_notes WHERE user_id = ? AND grow_id = ? AND date = ?",
  ).bind(user.id, growId, date).all();
  const notes = {};
  for (const r of result.results || []) notes[String(r.task_index)] = r.note;
  return json({ date, notes });
}

export async function putTaskNote(request, env, user, growId, date, taskIndex) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");
  if (!Number.isInteger(taskIndex) || taskIndex < 0 || taskIndex > 99)
    return error(400, "invalid task index");

  const parsed = await safeJsonBounded(request, MAX_TASK_NOTE_LEN + 256);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  if (typeof body?.note !== "string") return error(400, "note must be a string");

  const note = body.note.slice(0, MAX_TASK_NOTE_LEN).trim();
  const now = nowIso();

  if (!note) {
    await env.DB.prepare(
      "DELETE FROM task_notes WHERE user_id = ? AND grow_id = ? AND date = ? AND task_index = ?",
    ).bind(user.id, growId, date, taskIndex).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO task_notes (user_id, grow_id, date, task_index, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, grow_id, date, task_index) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    ).bind(user.id, growId, date, taskIndex, note, now).run();
  }
  return json({ ok: true, note });
}
