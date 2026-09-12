// The archive: what happens to a grow space you are finished with.
//
// Nothing in this app deletes a space. Archiving keeps every row it ever
// wrote - the calendar, the journal, the day log, every plant's history and
// every photo - and only takes it out of the way. Unarchiving puts it back.
//
// That makes the archive the one place the record grows without bound, so it
// has a ceiling: a number of spaces, and the bytes they occupy. Whichever is
// reached first, archiving something new makes room by dropping the spaces
// that have been archived longest. That drop IS a delete and it is the only
// one in the app, so it is never silent: the app names exactly which spaces
// would go and does nothing until the grower says yes.
//
// Pure, so the worker and its tests agree about when the archive is full.

/** A count of spaces, and the bytes they hold. Both are ceilings. */
export const ARCHIVE_MAX_SPACES = 20;
// D1 gives the whole database 5 GB. Half of it is a fair share for spaces that
// are finished, and still leaves room for several photo-heavy live grows.
export const ARCHIVE_MAX_BYTES = 2.5 * 1024 * 1024 * 1024;

export const ARCHIVE_CAPS = { maxSpaces: ARCHIVE_MAX_SPACES, maxBytes: ARCHIVE_MAX_BYTES };

/**
 * Which archived spaces have to go for `incoming` to fit.
 *
 * `archived` is what the archive already holds, OLDEST ARCHIVED FIRST, each
 * `{ id, bytes }`. `incoming` is the space about to join them. Returns the
 * spaces to drop, oldest first, which is empty whenever it already fits.
 *
 * The incoming space is never evicted, so a single space larger than the whole
 * byte budget empties the archive and is then archived anyway. That is the
 * right answer: the alternative is refusing to keep the thing the grower just
 * asked to keep.
 */
export function planEviction(archived, incoming, caps = ARCHIVE_CAPS) {
  const maxSpaces = caps?.maxSpaces ?? ARCHIVE_MAX_SPACES;
  const maxBytes = caps?.maxBytes ?? ARCHIVE_MAX_BYTES;
  const queue = (archived ?? []).filter((g) => g && g.id !== incoming?.id);

  let count = queue.length + (incoming ? 1 : 0);
  let bytes = queue.reduce((sum, g) => sum + (Number(g.bytes) || 0), 0)
    + (Number(incoming?.bytes) || 0);

  const evict = [];
  while (queue.length && (count > maxSpaces || bytes > maxBytes)) {
    const oldest = queue.shift();
    evict.push(oldest);
    count -= 1;
    bytes -= Number(oldest.bytes) || 0;
  }
  return evict;
}

/** What the archive holds now, against what it may hold. */
export function archiveFullness(spaces, caps = ARCHIVE_CAPS) {
  const maxSpaces = caps?.maxSpaces ?? ARCHIVE_MAX_SPACES;
  const maxBytes = caps?.maxBytes ?? ARCHIVE_MAX_BYTES;
  const list = spaces ?? [];
  const bytes = list.reduce((sum, g) => sum + (Number(g?.bytes) || 0), 0);
  return {
    count: list.length,
    bytes,
    maxSpaces,
    maxBytes,
    // Whichever ceiling is nearer is the one worth showing.
    fraction: Math.min(1, Math.max(
      maxSpaces ? list.length / maxSpaces : 0,
      maxBytes ? bytes / maxBytes : 0,
    )),
  };
}

/** Bytes in the units a person reads. */
export function formatBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value >= 10 || i === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${units[i]}`;
}
