import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  rowOffsets, visibleRange, wholeRange, WINDOW_THRESHOLD, OVERSCAN,
} from "../src/lib/windowedList.js";
import { rowHeight, ROW_H, ROW_H_RATED } from "../src/lib/strainRowHeight.js";

const heights = (n, h = 65) => Array.from({ length: n }, () => h);

test("offsets are running tops, and the last one is the full height", () => {
  const o = rowOffsets([10, 20, 30]);
  assert.deepEqual(o, [0, 10, 30, 60]);
  assert.equal(o.at(-1), 60);
});

test("the spacers and the mounted rows always add up to the whole list", () => {
  // This is the property that keeps the scrollbar honest. If it ever fails the
  // list jumps under the finger as rows come and go.
  const hs = [65, 74, 65, 65, 74, 65, 65, 65, 74, 65];
  const offsets = rowOffsets(hs);
  const total = offsets.at(-1);
  for (const scrollTop of [-200, 0, 37, 120, 400, 650, total, total + 500]) {
    const r = visibleRange({ offsets, scrollTop, viewportH: 300, overscan: 1 });
    const mounted = hs.slice(r.start, r.end).reduce((a, b) => a + b, 0);
    assert.equal(r.padTop + mounted + r.padBottom, total,
      `at scrollTop ${scrollTop} the heights stopped adding up`);
  }
});

test("the window covers what is on screen, plus the overscan", () => {
  const offsets = rowOffsets(heights(100));
  // Scrolled to row 20 exactly, 5 rows visible.
  const r = visibleRange({ offsets, scrollTop: 20 * 65, viewportH: 5 * 65, overscan: 2 });
  assert.ok(r.start <= 20, "the first visible row is not mounted");
  assert.ok(r.end >= 25, "the last visible row is not mounted");
  assert.equal(r.start, 18);
});

test("scrolled above the list, the window starts at the first row", () => {
  // The list sits below the fold, so its own scrollTop is negative.
  const offsets = rowOffsets(heights(100));
  const r = visibleRange({ offsets, scrollTop: -500, viewportH: 800 });
  assert.equal(r.start, 0);
  assert.equal(r.padTop, 0);
});

test("scrolled past the end, the window stops at the last row", () => {
  const offsets = rowOffsets(heights(100));
  const r = visibleRange({ offsets, scrollTop: 99999, viewportH: 800 });
  assert.equal(r.end, 100);
  assert.equal(r.padBottom, 0);
});

test("an empty list windows to nothing rather than throwing", () => {
  const r = visibleRange({ offsets: rowOffsets([]), scrollTop: 0, viewportH: 800 });
  assert.deepEqual(r, { start: 0, end: 0, padTop: 0, padBottom: 0 });
});

test("a short list is not windowed at all", () => {
  // Windowing is the fiddliest code in any list and buys nothing on forty rows,
  // so under the threshold the plain path runs with no spacers and no listener.
  const r = wholeRange(40);
  assert.deepEqual(r, { start: 0, end: 40, padTop: 0, padBottom: 0 });
  assert.ok(WINDOW_THRESHOLD >= 40, "the threshold is low enough to window a list nobody would notice");
  assert.ok(OVERSCAN >= 4, "too little overscan shows blank rows on a fast flick");
});

test("row height comes from the strain, not from measuring the page", () => {
  assert.equal(rowHeight({ rating: 0 }), ROW_H);
  assert.equal(rowHeight({}), ROW_H);
  assert.equal(rowHeight(null), ROW_H);
  assert.equal(rowHeight({ rating: 4 }), ROW_H_RATED);
  assert.ok(ROW_H_RATED > ROW_H, "the star line has to make the row taller");
});

const libSrc = readFileSync(
  new URL("../src/components/StrainLibrary.jsx", import.meta.url).pathname, "utf8");

test("the styles the row heights are derived from have not moved", () => {
  // ROW_H is padding + minHeight + divider. If somebody changes any of those,
  // the constant is wrong and the list scrolls slightly off, which is the sort
  // of bug nobody traces back to a number in another file. Fail here instead.
  assert.match(libSrc, /padding: "11px 4px 11px 14px", minHeight: 58/);
  assert.match(libSrc, /marginTop: 5 \}\}>\s*\n\s*<StrainStars value=\{strain\.rating\} size=\{12\}/);
  // And both text lines stay clipped to one line, or rows start wrapping and
  // the whole from-the-data premise collapses.
  assert.equal((libSrc.match(/textOverflow: "ellipsis", whiteSpace: "nowrap"/g) ?? []).length, 2);
});

test("the row is memoized and its handlers are stable", () => {
  // memo on a row whose props are rebuilt every render is pure overhead, so the
  // two callbacks it takes have to be stable for it to skip anything.
  assert.match(libSrc, /const StrainRow = memo\(function StrainRow/);
  assert.match(libSrc, /const toggleFavorite = useCallback\(/);
  assert.match(libSrc, /const openStrain = useCallback\(/);
  assert.ok(!/onOpen=\{\(x\) => setOpenKey/.test(libSrc), "a fresh arrow per row defeats the memo");
});

test("typing does not block on re-filtering the list", () => {
  assert.match(libSrc, /const deferredQuery = useDeferredValue\(query\)/);
  assert.match(libSrc, /query: deferredQuery/);
});

const hookSrc = readFileSync(
  new URL("../src/lib/useWindowedRows.js", import.meta.url).pathname, "utf8");

test("scroll is heard in the capture phase, wherever it happens", () => {
  // Scroll events do not bubble. A listener on window hears the document and
  // nothing else, so on a screen that scrolls an inner overflow:auto box the
  // range gets measured once and never again: the same rows stay mounted while
  // the spacer slides past. This app has both kinds of screen.
  assert.match(hookSrc, /document\.addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\)/);
  assert.match(hookSrc, /document\.removeEventListener\("scroll", onScroll, \{ capture: true \}\)/);
  assert.ok(!/window\.addEventListener\("scroll"/.test(hookSrc),
    "a window scroll listener cannot hear an inner scroller");
});
