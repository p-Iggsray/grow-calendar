import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_INNER_EARS, CAT_WHISKERS, CAT_NOSE,
  catMarkSvg,
} from "../src/lib/catMark.js";

// The app icon is drawn by hand rather than generated, so it can carry
// gradients and a rim light the flat mark has no use for. The cost of that is
// that its paths are a copy, and a copy can drift. This is the tripwire: move
// the geometry and the icon fails until it is moved too (edit public/icon.svg,
// then re-run scripts/icons.mjs).
test("the app icon draws the same cat as the rest of the app", () => {
  const icon = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
  for (const d of [CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_NOSE, ...CAT_INNER_EARS, ...CAT_WHISKERS]) {
    assert.ok(icon.includes(d), `icon.svg is missing the path ${d.slice(0, 28)}...`);
  }
});

test("the mark is symmetric about its centre line", () => {
  // A face that is off by a unit reads as wrong long before anyone can say
  // why, and these numbers are typed by hand.
  const mirror = (n) => Number((100 - n).toFixed(4));
  const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

  const [lx, ly] = [nums(CAT_INNER_EARS[0]), nums(CAT_INNER_EARS[1])];
  assert.deepEqual(ly.filter((_, i) => i % 2 === 0).map(mirror), lx.filter((_, i) => i % 2 === 0));

  for (let i = 0; i < 3; i++) {
    const left = nums(CAT_WHISKERS[i]);
    const right = nums(CAT_WHISKERS[i + 3]);
    assert.deepEqual(left.map((n, j) => (j % 2 === 0 ? mirror(n) : n)), right);
  }
});

test("a printed mark knocks the face out rather than shading it", () => {
  const svg = catMarkSvg({ width: 40, ink: "#000", eye: "#fff", pupil: "#000", face: "#fff", fill: "#000" });
  // Eyes, nose and muzzle all have to be white, or on paper they vanish into
  // the black they are drawn on.
  assert.ok(svg.includes(`<path d="${CAT_EYE_L}" fill="#fff"/>`));
  assert.ok(svg.includes(`<path d="${CAT_NOSE}" fill="#fff"/>`));
  assert.match(svg, /stroke="#fff"/);
});
