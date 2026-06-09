// Offline checkoff queue — persists writes that fail when the network is
// unavailable and replays them when connectivity returns.
// Latest write wins per date (full taskStates object, not a diff).

const QUEUE_KEY = "grow_offline_checkoffs";

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "{}"); }
  catch { return {}; }
}

function writeQueue(q) {
  if (Object.keys(q).length === 0) localStorage.removeItem(QUEUE_KEY);
  else localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

/** Queue or update a checkoff write for `date`. */
export function queueCheckoff(date, taskStates, growId) {
  const q = readQueue();
  q[date] = { taskStates, growId: growId ?? null };
  writeQueue(q);
}

/** True if there are any pending offline writes. */
export function hasPendingCheckoffs() {
  return Object.keys(readQueue()).length > 0;
}

/**
 * Flush all queued writes using `putFn(date, taskStates) → Promise`.
 * Successfully written entries are removed; failed entries remain for the
 * next flush attempt.
 */
export async function flushCheckoffQueue(putFn) {
  const q = readQueue();
  const entries = Object.entries(q);
  if (entries.length === 0) return;

  const remaining = { ...q };
  await Promise.allSettled(
    entries.map(async ([date, val]) => {
      // Back-compat: older queued items stored the bare taskStates object.
      const taskStates = val && val.taskStates ? val.taskStates : val;
      const growId = val && val.growId ? val.growId : undefined;
      await putFn(date, taskStates, growId);
      delete remaining[date];
    })
  );
  writeQueue(remaining);
}
