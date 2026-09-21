import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

// The block that swaps one tab screen for another.
function tabContent() {
  const start = app.indexOf('<AnimatePresence mode="wait">');
  assert.ok(start > 0, "App.jsx no longer has the tab-content AnimatePresence");
  const end = app.indexOf("</AnimatePresence>", start);
  return app.slice(start, end);
}

test("no tab screen fades out on its way off", () => {
  // This is the whole of the tab-switch fix and it is invisible in a diff:
  // adding `exit` back for symmetry looks harmless and costs ~140ms on every
  // switch, because mode="wait" will not mount the incoming screen until the
  // outgoing one has finished exiting. Traced at 4x CPU, Calendar to Spaces:
  // with exit fades the new screen mounted at 231ms and was readable at 395ms;
  // without them, 80ms and 258ms.
  assert.ok(!/\bexit\s*=/.test(tabContent()),
    "a tab screen has an exit animation again, which serialises the switch");
});

test("the screens still take turns rather than overlapping", () => {
  // mode="wait" earns its place for a different reason now: without it both
  // screens are in flow at once mid-switch and the layout jumps.
  assert.ok(app.includes('<AnimatePresence mode="wait">'));
});

test("the incoming screen still fades rather than snapping", () => {
  const block = tabContent();
  assert.ok(block.includes("initial={{ opacity: 0 }}"));
  assert.ok(block.includes("animate={{ opacity: 1 }}"));
  assert.match(app, /const FADE_DURATION = \{ duration: 0\.15 \};/);
});

test("the screens that slide in are left alone", () => {
  // Stats and the chat panel are a different interaction: they come in over
  // the top and go back out the way they came, so their exits are real.
  assert.match(app, /initial=\{\{ x: "100%" \}\}/);
});
