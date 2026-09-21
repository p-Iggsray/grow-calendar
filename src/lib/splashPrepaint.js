// The opening, drawn before React exists.
//
// index.html used to carry three lines of critical CSS: a black background, so
// there was no white flash. That works, but a black rectangle is not the brand,
// and the gap it covers is long. Measured on a throttled phone, React does not
// mount the real splash until 124ms on a warm launch and 3.2 seconds on a cold
// one over a slow connection. None of that needs to be nothing: the mark is
// geometry and the wordmark is three lines of text, so both can be on screen in
// the document's own first paint.
//
// This builds that paint as a string, and vite injects it into #root. React
// clears the container when it mounts, so nothing has to remove it.
//
// Two rules keep it honest.
//
// It cannot use a CSS custom property. The tokens live in the stylesheet
// bundle, which on a cold launch has not arrived, so every colour here is a
// literal and test/splash-prepaint.test.js holds each one to the token it
// copies.
//
// And NOTHING HERE ANIMATES. That is not a stylistic choice, it is the
// platform: a CSS animation is created during style resolution but is not
// given a start time until the first rendering opportunity, and on a cold
// launch that frame does not come until the bundle has parsed. An entrance
// here would therefore be held at its from-frame - opacity zero - for exactly
// the window this exists to cover, which is worse than no paint at all. It was
// written that way first and measured: `startTime: null`, `opacity: 0`, at
// DOMContentLoaded. So this paints the opening at rest, and Splash, seeing it
// already on screen, skips its own entrance rather than fading a visible mark
// back out and in. See src/lib/launch.js.

import { litCatMarkSvg } from "./catMark.js";

/** The element Splash looks for to know it is taking over rather than opening. */
export const PREPAINT_ID = "bcb-prepaint";
export const MARK_ID = "bcb-prepaint-mark";

// Brand literals. Each one is pinned to its stylesheet token by a test.
const BG = "#0c0b0a";
const TEXT = "#f5f0e8";
const TEXT_DIM = "#cdbfa9";
const TEXT_FAINT = "#877969";
const ACCENT_RGB = "224, 145, 63";

const FONT_UI =
  `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, ` +
  `"Helvetica Neue", Arial, sans-serif`;

/** The stylesheet for the paint. */
export function prepaintCss() {
  return `
html { background: ${BG}; }
body { margin: 0; }
#root { min-height: 100vh; }
#${PREPAINT_ID} {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 22px;
  background-color: ${BG};
  background-image: radial-gradient(120% 80% at 50% 18%, rgba(${ACCENT_RGB}, 0.13), transparent 60%);
  font-family: ${FONT_UI};
  color: ${TEXT};
  padding: 0 24px;
  padding-top: env(safe-area-inset-top, 0px);
}
#${PREPAINT_ID} .cat {
  position: relative; width: 132px; height: 118px;
  display: flex; align-items: center; justify-content: center;
}
/* The glow and the dots sit at the first frame of the loops Splash runs on
   them, so when it takes over they carry on from where they are. */
#${PREPAINT_ID} .glow {
  position: absolute; width: 108px; height: 108px; border-radius: 50%;
  background: radial-gradient(circle, rgba(${ACCENT_RGB}, 0.4), rgba(${ACCENT_RGB}, 0) 70%);
  filter: blur(2px);
  opacity: 0.3; transform: scale(0.85);
}
#${MARK_ID} { position: relative; line-height: 0; }
#${PREPAINT_ID} .word { text-align: center; }
#${PREPAINT_ID} .est {
  font-size: 11px; letter-spacing: 5px; text-transform: uppercase;
  color: ${TEXT_FAINT}; margin-bottom: 8px;
}
#${PREPAINT_ID} .name {
  font-size: 30px; font-weight: 900; letter-spacing: -1px; line-height: 1.05;
}
#${PREPAINT_ID} .tag {
  font-size: 13.5px; color: ${TEXT_DIM}; margin-top: 8px; letter-spacing: 0.2px;
}
#${PREPAINT_ID} .dots { display: flex; gap: 7px; }
#${PREPAINT_ID} .dots i {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgb(${ACCENT_RGB}); opacity: 0.25;
}`.trim();
}

/** The paint itself, for the inside of #root. */
export function prepaintHtml() {
  return (
    `<div id="${PREPAINT_ID}" role="status" aria-busy="true" ` +
      `aria-label="Loading Black Cat Botanicals">` +
      `<div class="cat"><div class="glow"></div>` +
        `<div id="${MARK_ID}">${litCatMarkSvg({ width: 140 })}</div>` +
      `</div>` +
      `<div class="word">` +
        `<div class="est">Est. 2026</div>` +
        `<div class="name">Black Cat Botanicals</div>` +
        `<div class="tag">Your grow, day by day.</div>` +
      `</div>` +
      `<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>` +
    `</div>`
  );
}
