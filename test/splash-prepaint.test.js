import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  prepaintCss, prepaintHtml, MARK_ID, PREPAINT_ID,
} from "../src/lib/splashPrepaint.js";
import {
  CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_NOSE, CAT_INNER_EARS, CAT_WHISKERS,
} from "../src/lib/catMark.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = prepaintCss();
const html = prepaintHtml();

test("the paint draws the same cat as the rest of the app", () => {
  for (const d of [CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_NOSE, ...CAT_INNER_EARS, ...CAT_WHISKERS]) {
    assert.ok(html.includes(d), `the prepaint is missing the path ${d.slice(0, 28)}...`);
  }
});

test("every colour in it matches the token it is copying", () => {
  // The stylesheet bundle has not arrived when this paints, so it cannot use a
  // custom property and has to carry literals instead. This is the tripwire
  // for those literals drifting away from the palette they came from.
  const styles = read("../src/styles.css");
  const token = (name) => {
    const m = styles.match(new RegExp(`--${name}:\\s*([^;]+);`));
    assert.ok(m, `styles.css has no --${name}`);
    return m[1].trim();
  };

  for (const name of ["c-bg", "c-text", "c-text-dim", "c-text-faint"]) {
    assert.ok(css.includes(token(name)), `the prepaint has drifted from --${name}`);
  }
  // The accent is used as rgba() components rather than as a hex.
  assert.ok(css.includes(`rgba(${token("c-accent-rgb")},`),
    "the prepaint has drifted from --c-accent-rgb");
});

test("index.html has somewhere to put it", () => {
  // Both placeholders are filled by the prepaint-splash plugin in
  // vite.config.js. Rename one without the other and the app ships a blank
  // opening, which nothing else would catch.
  const index = read("../index.html");
  assert.match(index, /<style>\/\* prepaint-css \*\/<\/style>/);
  assert.match(index, /<div id="root"><!-- prepaint --><\/div>/);
});

test("the mark carries the id Splash looks for it by", () => {
  // src/lib/launch.js finds the element by this id and Splash skips its
  // entrance when it is there. Rename one without the other and the entrance
  // plays over an already-visible mark, which is a flicker rather than an
  // error.
  assert.ok(html.includes(`id="${MARK_ID}"`));
  assert.ok(read("../src/lib/launch.js").includes("MARK_ID"));
  assert.ok(read("../src/components/Splash.jsx").includes("PREPAINTED"));
});

test("nothing in the paint animates", () => {
  // Load-bearing, and the reason is not obvious. A CSS animation gets no start
  // time until the first rendering opportunity, which on a cold launch is
  // after the bundle has parsed - so an entrance here is pinned at its
  // from-frame, opacity zero, for exactly the window this exists to cover.
  // Measured before it was removed: startTime null, opacity 0, at
  // DOMContentLoaded. An animation creeping back in here would silently blank
  // the opening again.
  assert.ok(!/@keyframes|animation:/.test(css), "the prepaint animates");
});

test("the paint keeps the background rule it replaced", () => {
  // It took over the three lines of critical CSS that stopped a white flash.
  assert.match(css, /html \{ background: #0c0b0a; \}/);
  assert.match(css, /body \{ margin: 0; \}/);
  assert.match(css, /#root \{ min-height: 100vh; \}/);
});

test("it announces itself the same way the React splash does", () => {
  // A screen reader should not hear the loading state twice, or differently,
  // just because the bundle happened to arrive.
  assert.ok(html.includes('aria-label="Loading Black Cat Botanicals"'));
  assert.ok(html.includes('role="status"'));
  assert.ok(read("../src/components/Splash.jsx").includes('aria-label="Loading Black Cat Botanicals"'));
});

test("it is small enough to belong in the document", () => {
  // It buys its place by being in the first paint, which it only is while the
  // HTML stays small enough to arrive in the first packets.
  assert.ok(html.length + css.length < 8000,
    `the prepaint is ${html.length + css.length} bytes`);
});

test("the glow and the dots are left where their loops begin", () => {
  // These two do keep animating under React. The paint parks them on the first
  // frame of each loop so that when Splash picks them up they carry on rather
  // than jump.
  const splash = read("../src/components/Splash.jsx");
  assert.match(splash, /opacity: \[0\.3, 0\.58, 0\.3\], scale: \[0\.85, 1\.05, 0\.85\]/);
  assert.match(css, /opacity: 0\.3; transform: scale\(0\.85\);/);
  assert.match(splash, /opacity: \[0\.25, 1, 0\.25\]/);
  assert.match(css, /background: rgb\(224, 145, 63\); opacity: 0\.25;/);
});

test("nothing in it leans on a stylesheet that has not loaded", () => {
  assert.ok(!css.includes("var(--"), "the prepaint uses a custom property");
  assert.ok(!html.includes("var(--"), "the prepaint uses a custom property");
});

test("the id Splash looks for is the one that is rendered", () => {
  assert.ok(html.includes(`id="${PREPAINT_ID}"`));
  assert.ok(css.includes(`#${PREPAINT_ID} {`));
});
