import { test } from "node:test";
import assert from "node:assert/strict";
import { batchResultMessage, MAX_BATCH, nextEdgeGuess, nextIndex, screenTargetEdge } from "../src/lib/photos.js";
import { validatePhotoInput } from "../worker/photos.js";

// ── batchResultMessage ───────────────────────────────────────────────────────
test("a fully successful batch says nothing at all", () => {
  assert.equal(batchResultMessage(5, []), "");
  assert.equal(batchResultMessage(0, []), "");
});

test("a partly successful batch reports how many landed", () => {
  const msg = batchResultMessage(3, ["a day holds at most 20 photos"]);
  assert.match(msg, /Added 3 of 4/);
  assert.match(msg, /at most 20 photos/);
});

test("a total failure does not pretend anything was added", () => {
  const msg = batchResultMessage(0, ["Could not read that image."]);
  assert.equal(msg, "Could not read that image.");
  assert.doesNotMatch(msg, /Added/);
});

test("identical failures are reported once, not once per file", () => {
  const same = Array(6).fill("a day holds at most 20 photos");
  const msg = batchResultMessage(0, same);
  assert.equal(msg, "a day holds at most 20 photos");
});

// ── nextIndex (swipe) ────────────────────────────────────────────────────────
test("a long drag turns the page in the direction of travel", () => {
  assert.equal(nextIndex(0, 5, -120, 0), 1);   // dragged left -> forward
  assert.equal(nextIndex(3, 5, 120, 0), 2);    // dragged right -> back
});

test("a fast flick turns the page even when it barely moved", () => {
  assert.equal(nextIndex(1, 5, -8, -900), 2);
  assert.equal(nextIndex(1, 5, 8, 900), 0);
});

test("a small slow drag stays put, so a tap is never a swipe", () => {
  assert.equal(nextIndex(2, 5, -20, -100), 2);
  assert.equal(nextIndex(2, 5, 0, 0), 2);
});

test("swiping past either end springs back instead of running off", () => {
  assert.equal(nextIndex(0, 5, 400, 2000), 0);       // before the first
  assert.equal(nextIndex(4, 5, -400, -2000), 4);     // past the last
  assert.equal(nextIndex(0, 1, -400, -2000), 0);     // a set of one
});

// ── the server still guards what the client sends ────────────────────────────
test("a batch cannot smuggle past the upload validator", () => {
  const good = {
    date: "2026-09-01",
    data: "data:image/jpeg;base64,AAAA",
    thumb: "data:image/jpeg;base64,AAAA",
  };
  assert.equal(validatePhotoInput(good).ok, true);
  assert.equal(validatePhotoInput({ ...good, data: "https://example.com/x.jpg" }).ok, false);
  assert.equal(validatePhotoInput({ ...good, date: "nope" }).ok, false);
  assert.equal(validatePhotoInput({ ...good, plantId: "../../etc" }).ok, false);
});

test("the client batch cap is a real number the day limit can absorb", () => {
  assert.ok(Number.isInteger(MAX_BATCH) && MAX_BATCH > 1);
});

// ── nextEdgeGuess (spending the byte budget) ─────────────────────────────────
test("an over-budget encode shrinks by roughly the square root of the overshoot", () => {
  // 4x over budget means about half the edge, less the deliberate undershoot.
  const next = nextEdgeGuess(3200, 2_000_000, 500_000);
  assert.ok(next > 1400 && next < 1600, `expected ~1500, got ${next}`);
});

test("a near miss shrinks only a little, so the budget is not wasted", () => {
  const next = nextEdgeGuess(2400, 700_000, 660_000);
  assert.ok(next > 2100 && next < 2304, `expected a small step down, got ${next}`);
});

test("every guess makes progress, so the loop cannot stall", () => {
  // Even barely over budget, the edge must actually decrease.
  assert.ok(nextEdgeGuess(2000, 660_001, 660_000) < 2000);
  for (const [edge, bytes, budget] of [[2000, 660_001, 660_000], [900, 1_000_000, 100], [3200, 5_000_000, 660_000]]) {
    assert.ok(nextEdgeGuess(edge, bytes, budget) < edge || nextEdgeGuess(edge, bytes, budget) === 480);
  }
});

test("shrinking bottoms out rather than collapsing to nothing", () => {
  // 480 is the floor: a size at which no photo can miss the budget.
  assert.equal(nextEdgeGuess(700, 90_000_000, 1000), 480);
  assert.equal(nextEdgeGuess(480, 90_000_000, 1000), 480);
  // Garbage measurements must not produce NaN or a negative edge.
  assert.ok(nextEdgeGuess(2000, 0, 660_000) > 0);
  assert.ok(nextEdgeGuess(2000, 500, 0) > 0);
});

// ── screenTargetEdge: photos are sized for the screen that shows them ────────
// The viewer is full-bleed, so a long edge equal to the display's real pixel
// count is pin sharp, and anything past it is bytes no screen will ever draw.

test("a phone's long edge is its CSS size times its pixel ratio", () => {
  assert.equal(screenTargetEdge(430, 932, 3), 2796);   // iPhone 15 Pro Max
  assert.equal(screenTargetEdge(932, 430, 3), 2796);   // held sideways, same answer
});

test("a small or low-density screen still gets a worthwhile photo", () => {
  // 375x667 at 2x is only 1334px; storing that little would be a shame.
  assert.equal(screenTargetEdge(375, 667, 2), 1600);
  assert.equal(screenTargetEdge(320, 480, 1), 1600);
});

test("a huge display does not ask for more than a camera gives", () => {
  assert.equal(screenTargetEdge(3840, 2160, 2), 3200);
  assert.equal(screenTargetEdge(1512, 982, 2), 3024);  // 16in MacBook, in range
});

test("a missing or nonsense screen falls back to something sensible", () => {
  for (const bad of [[0, 0, 0], [null, null, null], ["x", "y", "z"], [undefined, undefined, 3]]) {
    const edge = screenTargetEdge(...bad);
    assert.ok(edge >= 1600 && edge <= 3200, `got ${edge} for ${JSON.stringify(bad)}`);
  }
  // A ratio of 0 or missing is treated as 1, not as "no screen".
  assert.equal(screenTargetEdge(2000, 1000, 0), 2000);
});
