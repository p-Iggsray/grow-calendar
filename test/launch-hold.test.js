import { test } from "node:test";
import assert from "node:assert/strict";

import {
  holdMs, COLD_HOLD_MS, WARM_HOLD_MS, REDUCED_HOLD_MS,
} from "../src/lib/launch.js";

// The hold is a title card, not a loading screen: measurement showed the app
// finished well before it expired in every condition, down to 400kbps with six
// times the CPU throttling. So what it is worth is a judgement, and these are
// the numbers that judgement settled on.

test("the first launch on a device gets the full opening", () => {
  assert.equal(holdMs({ warm: false }), COLD_HOLD_MS);
});

test("every launch after that is short", () => {
  assert.equal(holdMs({ warm: true }), WARM_HOLD_MS);
  assert.ok(WARM_HOLD_MS < COLD_HOLD_MS);
});

test("reduced motion wins over both, because there is nothing to watch", () => {
  assert.equal(holdMs({ warm: false, reduce: true }), REDUCED_HOLD_MS);
  assert.equal(holdMs({ warm: true, reduce: true }), REDUCED_HOLD_MS);
  assert.ok(REDUCED_HOLD_MS < WARM_HOLD_MS);
});

test("an unknown launch is treated as cold", () => {
  // The signals can both be missing: blocked storage and no service worker.
  // Erring cold shows the opening once too often, which is the harmless way
  // to be wrong.
  assert.equal(holdMs(), COLD_HOLD_MS);
  assert.equal(holdMs({}), COLD_HOLD_MS);
});

test("no hold is long enough to outlast a slow cold launch's own work", () => {
  // Measured: the worst cold launch painted the calendar at 4836ms. The point
  // of the hold is the animation, so it must not be so long that it becomes
  // the thing being waited on again.
  assert.ok(COLD_HOLD_MS < 4836);
});
