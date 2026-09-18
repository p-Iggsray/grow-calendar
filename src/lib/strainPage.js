// Where a label's code points.
//
// The address is a random code the server mints per variety, not the variety's
// name. A name is a word anybody can type, so the old /s/<name> let a stranger
// confirm which varieties existed by guessing; a code cannot be arrived at
// except by scanning the label it was printed on.
//
// A variety with no public page (a mushroom, or a name nobody has grown yet)
// has no code, and its label prints without a QR rather than with a dead one.

/** The public page path for a minted code, or null when there is none. */
export function strainPagePath(code) {
  const c = String(code ?? "").trim();
  return /^[A-Za-z0-9_-]{12,32}$/.test(c) ? `/s/${c}` : null;
}
