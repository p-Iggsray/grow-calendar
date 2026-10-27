import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EYE_L, EYE_R, EYE_LID_L, EYE_LID_R, PUPIL_L, PUPIL_R, GRIN, TEETH, JOINT,
  catMarkSvg, markSteps, markAspect,
} from "../src/lib/catMark.js";

const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("the app icon draws the same grin as the rest of the app", () => {
  // scripts/icons.mjs writes icon.svg from the mark. A hand edit to either
  // fails here until the icon is regenerated.
  const icon = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
  for (const d of [EYE_L, EYE_R, PUPIL_L, GRIN, TEETH, JOINT]) {
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
    assert.ok(!markSteps({ tone }).some((s) => s.glow || typeof s.fill === "object"), tone);
  }
  const svg = catMarkSvg({ tone: "mono" });
  assert.doesNotMatch(svg, /<defs>|url\(#/);
});

test("ids are scoped, so two marks on one page keep their own paint", () => {
  const a = catMarkSvg({ uid: "one", glow: true });
  const b = catMarkSvg({ uid: "two", glow: true });
  assert.match(a, /id="one-smoke"/);
  assert.match(a, /url\(#one-ember\)/);
  assert.doesNotMatch(b, /one-/);
});

test("the face alone is a tighter box than the mark with its smoke", () => {
  assert.ok(markAspect({ smoke: false }) < markAspect({ smoke: true }));
  assert.match(catMarkSvg({ width: 100, smoke: false }), /width="100" height="43"/);
});

test("a title makes it an image for screen readers; without one it is hidden", () => {
  assert.match(catMarkSvg({ title: "Black Cat Budz" }), /role="img" aria-label="Black Cat Budz"/);
  assert.match(catMarkSvg(), /aria-hidden="true"/);
});
