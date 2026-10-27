import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EYE_L, EYE_R, EYE_LID_L, EYE_LID_R, PUPIL_L, PUPIL_R, GRIN, TEETH, STEM, LEAF_L, LEAF_R,
  catMarkSvg, markSteps,
} from "../src/lib/catMark.js";

const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("the app icon draws the same grin as the rest of the app", () => {
  // scripts/icons.mjs writes icon.svg from the mark. A hand edit to either
  // fails here until the icon is regenerated.
  const icon = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
  for (const d of [EYE_L, EYE_R, PUPIL_L, GRIN, TEETH, STEM, LEAF_L, LEAF_R]) {
    assert.ok(icon.includes(d), `icon.svg is missing the path ${d.slice(0, 28)}...`);
  }
});

test("the right eye is the left eye mirrored about the face's centre line", () => {
  const AXIS_X2 = 2024;
  for (const [left, right] of [[EYE_L, EYE_R], [EYE_LID_L, EYE_LID_R], [PUPIL_L, PUPIL_R]]) {
    const l = nums(left);
    const r = nums(right);
    assert.equal(l.length, r.length);
    l.forEach((n, i) => assert.equal(i % 2 === 0 ? AXIS_X2 - n : n, r[i]));
  }
});

test("the one-ink mark uses one ink and its knockout, nothing else", () => {
  // A thermal head has no greys: a single tint on the label prints as a dither.
  for (const tone of ["mono", "monoInverse"]) {
    const colours = new Set(markSteps({ tone }).flatMap((s) => [s.fill, s.stroke]).filter(Boolean));
    assert.deepEqual([...colours].sort(), ["#000", "#fff"], tone);
    assert.ok(!markSteps({ tone }).some((s) => s.blur || typeof s.fill === "object" || typeof s.stroke === "object"), tone);
  }
  const svg = catMarkSvg({ tone: "mono" });
  assert.doesNotMatch(svg, /<defs>|url\(#/);
});

test("ids are scoped, so two marks on one page keep their own paint", () => {
  const a = catMarkSvg({ uid: "one", glow: true });
  const b = catMarkSvg({ uid: "two", glow: true });
  assert.match(a, /id="one-leafL"/);
  assert.match(a, /url\(#one-stem\)/);
  assert.doesNotMatch(b, /one-/);
});

test("the stem goes behind the grin, so it disappears into the mouth", () => {
  // Paint order is the whole trick: drawn after the grin, the stem would sit
  // on the teeth instead of between them.
  for (const tone of ["color", "mono"]) {
    const steps = markSteps({ tone });
    const at = (d) => steps.findIndex((s) => s.d === d);
    assert.ok(at(STEM) < at(GRIN), tone);
    assert.ok(at(GRIN) < at(TEETH), tone);
  }
});

test("a title makes it an image for screen readers; without one it is hidden", () => {
  assert.match(catMarkSvg({ title: "Black Cat Growz" }), /role="img" aria-label="Black Cat Growz"/);
  assert.match(catMarkSvg(), /aria-hidden="true"/);
});
