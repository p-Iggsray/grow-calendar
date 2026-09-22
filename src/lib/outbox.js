// Writes made with no signal, kept until there is one.
//
// The offline banner has always said "changes will sync when reconnected".
// Nothing synced. Driving a browser offline and writing a journal entry gave a
// failed PUT, a "Save failed" beside the WRITING header, no retry when the
// connection came back, and an entry that was gone after a reload. The banner
// was the only part of that which was untrue, and this is what makes it true.
//
// ── What may be queued, and why not everything ─────────────────────────────
//
// Only writes that address a thing by its own key and replace it whole. A PUT
// to /api/notes/2026-09-01 says "this day's note is now exactly this", so
// sending it late, or twice, or after three more edits, lands the same way.
// That is the property that makes a queue safe without a merge.
//
// Creates are deliberately excluded. A new plant, a new space, a photo: those
// are POSTs whose ids the server hands back, and a log entry written offline
// against a plant that does not exist yet cannot be replayed without inventing
// ids on the client and reconciling them later. Those still fail at the time,
// the way they do now, rather than pretending.
//
// ── Why edits collapse ─────────────────────────────────────────────────────
//
// The note autosaves 800ms after each pause in typing. Ten minutes of writing
// in a tent is not a hundred queued requests, it is one: entries are keyed by
// what they are writing to, and a later edit to the same day replaces the
// earlier one. The queue holds the destination's final state, not a history of
// how it got there.

/** Where the queue lives between launches. */
export const OUTBOX_KEY = "bcb.outbox";

/**
 * Bounds, so a fortnight in a dead zone cannot fill storage and take the app
 * down with it. The oldest entries go first: the note you wrote an hour ago
 * matters more than the one from last week, and the older one has most likely
 * been superseded anyway.
 */
export const MAX_ENTRIES = 200;
export const MAX_BYTES = 2 * 1024 * 1024;

// Paths whose PUT replaces the whole thing at a key. Each is anchored and
// allows a query string, because the grow id rides there and is part of the
// target: the same date in two spaces is two different destinations.
const REPLACES_WHOLE = [
  /^\/api\/notes\/\d{4}-\d{2}-\d{2}(\?|$)/,
  /^\/api\/grow-log\/\d{4}-\d{2}-\d{2}(\?|$)/,
  /^\/api\/strain-library(\?|$)/,
  /^\/api\/strain-library\/photos(\?|$)/,
];

/**
 * Whether this write can wait for a signal.
 * @param {string} method
 * @param {string} path
 */
export function isReplayable(method, path) {
  return method === "PUT" && REPLACES_WHOLE.some((re) => re.test(path));
}

/**
 * What a queued write is writing to. Two edits sharing this key are two
 * versions of one thing, and only the later one is worth sending.
 * @param {string} method
 * @param {string} path
 */
export function entryKey(method, path) {
  return `${method} ${path}`;
}

/**
 * Pure: add an entry, replacing any earlier one for the same destination.
 *
 * A replacement keeps its original place in the line rather than jumping to
 * the back. Order only matters between different destinations, and a note
 * edited twice should not overtake a grow-log entry written between the two.
 *
 * @param {Array} queue
 * @param {{key: string, path: string, method: string, body: string, at: number}} entry
 */
export function put(queue, entry) {
  const at = queue.findIndex((e) => e.key === entry.key);
  if (at === -1) return [...queue, entry];
  const next = queue.slice();
  next[at] = { ...entry, at: queue[at].at };
  return next;
}

/** Pure: the queue without that destination. */
export function drop(queue, key) {
  return queue.filter((e) => e.key !== key);
}

/**
 * Pure: the queue cut down to its bounds, oldest dropped first.
 * @returns {{queue: Array, dropped: number}}
 */
export function trim(queue, { maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES } = {}) {
  let next = queue;
  let dropped = 0;
  while (next.length > maxEntries) { next = next.slice(1); dropped++; }
  while (next.length > 1 && bytes(next) > maxBytes) { next = next.slice(1); dropped++; }
  return { queue: next, dropped };
}

/** Roughly what the queue costs in storage. */
export function bytes(queue) {
  let n = 0;
  for (const e of queue) n += (e.body?.length ?? 0) + (e.path?.length ?? 0) + 64;
  return n;
}

// ── Storage ────────────────────────────────────────────────────────────────
//
// Every read and write is guarded. Storage throws in a private window and can
// come back empty after the browser reclaims it, and neither of those is a
// reason for a save to fail differently than it would have anyway.

/** @returns {Array} */
export function load() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isWellFormed) : [];
  } catch { return []; }
}

function isWellFormed(e) {
  return e && typeof e.key === "string" && typeof e.path === "string"
    && typeof e.method === "string" && typeof e.body === "string";
}

/** @returns {boolean} whether it was actually written */
export function save(queue) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
    return true;
  } catch { return false; }
}

export function clear() {
  try { localStorage.removeItem(OUTBOX_KEY); } catch { /* nothing to do */ }
}
