// Rendering only the rows somebody can actually see.
//
// A list of two hundred strains mounts two hundred rows, each carrying a cover
// image and three icons, and on a mid-range phone that is most of a second with
// the screen frozen. Nothing can memo that away: React.memo skips re-renders
// and a first mount is not one. The only fix is to not mount them.
//
// This is exact rather than estimated. Row height here is decided by the DATA
// (a strain with stars is taller than one without), not by how the text happens
// to wrap, so the offsets can be computed up front and the window never drifts
// the way a guessed average does.
//
// Pure. The hook that drives it lives in useWindowedRows.js.

/**
 * Below this many rows, nothing is windowed.
 *
 * Windowing is the fiddliest code in any list, and under a threshold it buys
 * nothing: forty rows mount fast enough that the machinery costs more risk than
 * it saves time. So a short list takes the plain path, with no scroll listener
 * and no spacers, and the windowing only wakes up for a library big enough to
 * hurt.
 */
export const WINDOW_THRESHOLD = 60;

/** Rows kept mounted beyond each edge, so a flick does not outrun the render. */
export const OVERSCAN = 8;

/**
 * Running tops for a list of row heights.
 *
 * Returns n+1 numbers: offsets[i] is where row i starts and offsets[n] is the
 * full height of the list, which is what the spacers have to add up to for the
 * scrollbar to stay honest.
 */
export function rowOffsets(heights) {
  const offsets = new Array(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i];
  return offsets;
}

/** The first row whose bottom is past `y`. Binary search over the offsets. */
function rowAt(offsets, y) {
  let lo = 0;
  let hi = offsets.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Which rows to mount.
 *
 * `scrollTop` is how far the list's own top has scrolled past the top of the
 * viewport, so it is negative while the list is still below the fold and the
 * window correctly starts at zero.
 *
 * Returns the half-open range plus the two spacer heights. padTop + the mounted
 * rows + padBottom always equals the full list height, which is the property
 * that keeps the scrollbar from jumping as rows come and go.
 */
export function visibleRange({ offsets, scrollTop, viewportH, overscan = OVERSCAN }) {
  const count = offsets.length - 1;
  if (count === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  const top = Math.max(0, scrollTop);
  const first = rowAt(offsets, top);
  const last = rowAt(offsets, top + Math.max(0, viewportH));

  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + overscan + 1);

  return {
    start,
    end,
    padTop: offsets[start],
    padBottom: offsets[count] - offsets[end],
  };
}

/**
 * The whole list, when it is short enough not to bother.
 *
 * Same shape as visibleRange, so the caller has one code path either way.
 */
export function wholeRange(count) {
  return { start: 0, end: count, padTop: 0, padBottom: 0 };
}
