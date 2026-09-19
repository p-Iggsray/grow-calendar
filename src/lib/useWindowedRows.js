// The React half of windowedList.js: watching whatever is scrolling and handing
// back the range of rows worth mounting.
//
// It never asks which element is the scroller. Screens in this app are a mix:
// some scroll the document, and some are a fixed box with overflow:auto inside
// it. So the position is read as the list's own top against the viewport, which
// is true under either, and the listener is registered in the CAPTURE phase on
// the document, which is the only way to hear scroll from an arbitrary
// element.
//
// That last part is not a detail. Scroll events do not bubble. A listener on
// window hears the document scrolling and nothing else, so on a screen that
// scrolls an inner box the window never fires, the range is measured once and
// never again, and the same twenty rows stay mounted while the spacer slides
// past underneath them. The list looks fast and is simply broken.
//
// Under WINDOW_THRESHOLD rows nothing is attached at all and the whole list
// comes back, so a short library costs exactly what it did before.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { rowOffsets, visibleRange, wholeRange, WINDOW_THRESHOLD } from "./windowedList.js";

/**
 * @param {number[]} heights one per row, in order
 * @returns {{ ref, start, end, padTop, padBottom, windowed }}
 */
export function useWindowedRows(heights) {
  const ref = useRef(null);
  const windowed = heights.length > WINDOW_THRESHOLD;

  const offsets = useMemo(
    () => (windowed ? rowOffsets(heights) : null),
    // The heights array is rebuilt every render, so compare its contents rather
    // than its identity: a rebuilt array with the same numbers is the same list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowed, heights.join(",")],
  );

  const [view, setView] = useState(() => wholeRange(heights.length));

  useEffect(() => {
    if (!windowed || !offsets) { setView(wholeRange(heights.length)); return; }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      // How far the list's top has gone past the top of the viewport.
      const scrollTop = -el.getBoundingClientRect().top;
      setView(visibleRange({ offsets, scrollTop, viewportH: window.innerHeight }));
    };
    // Coalesce to one measurement per frame: scroll fires far more often than
    // there are frames to render, and each one would otherwise set state.
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };

    measure();
    // Capture, on the document: scroll does not bubble, so this is what hears
    // an inner overflow:auto box as well as the page itself.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  }, [windowed, offsets, heights.length]);

  // Filtering changes the list under a scroll position that was measured
  // against the old one, so re-measure before the browser paints rather than
  // after: a frame of the wrong rows is a visible flicker.
  useLayoutEffect(() => {
    if (!windowed || !offsets) return;
    const el = ref.current;
    if (!el) return;
    setView(visibleRange({
      offsets,
      scrollTop: -el.getBoundingClientRect().top,
      viewportH: window.innerHeight,
    }));
  }, [windowed, offsets]);

  return { ref, ...view, windowed };
}
