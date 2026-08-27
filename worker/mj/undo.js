// @ts-check
// POST /mj/undo - reverts note appends made by MJ tools. Task check-off undo
// left with the task system; restoring a day's note is the one undoable action.
import { json, error, safeJsonBounded } from "../util.js";
import { firstGrowId } from "../perDayScope.js";
import { writeNote, MAX_NOTE_LEN } from "../notes.js";
import { DATE_RE } from "./constants.js";

// The payload carries the full original note, so the bound must fit a maximum-
// length note plus JSON escaping headroom (same sizing as worker/notes.js).
const MAX_UNDO_REQUEST_BYTES = MAX_NOTE_LEN * 4 + 256;

export async function postMjUndo(request, env, user) {
  const parsed = await safeJsonBounded(request, MAX_UNDO_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  const { type, date } = body ?? {};

  if (typeof date !== "string" || !DATE_RE.test(date)) return error(400, "date must be YYYY-MM-DD");

  const growId = new URL(request.url).searchParams.get("growId") || await firstGrowId(env, user.id);

  if (type === "undo_append_note") {
    const { originalNote } = body;
    if (typeof originalNote !== "string") return error(400, "invalid undo payload");
    if (originalNote.length > MAX_NOTE_LEN) return error(400, "original note too long");
    await writeNote(env, user.id, growId, date, originalNote);
    return json({ ok: true });
  }

  return error(400, "nothing to undo for this action");
}
