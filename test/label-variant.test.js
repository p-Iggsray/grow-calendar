import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_VARIANTS, DEFAULT_VARIANT, normalizeVariant, variantSuffix,
} from "../src/lib/labelVariant.js";
import { labelFields } from "../src/lib/growLabel.js";
import { drawLabel, LABEL_W, LABEL_H } from "../src/lib/growLabel.js";
import { drawColorLabel } from "../src/lib/growLabelColor.js";
import { readFileSync } from "node:fs";

test("there are exactly two labels, and the colour one is the default", () => {
  assert.deepEqual(LABEL_VARIANTS.map((v) => v.value), ["colour", "plain"]);
  assert.equal(DEFAULT_VARIANT, "colour");
});

test("an unrecognised stored value falls back rather than drawing nothing", () => {
  for (const bad of [null, undefined, "", "fancy", 7, {}]) {
    assert.equal(normalizeVariant(bad), DEFAULT_VARIANT);
  }
  assert.equal(normalizeVariant("plain"), "plain");
});

test("the two labels save under different names", () => {
  // Same strain, both variants: one file must not quietly replace the other in
  // a camera roll.
  assert.notEqual(variantSuffix("colour"), variantSuffix("plain"));
  assert.equal(variantSuffix("plain"), "bw");
  assert.equal(variantSuffix("nonsense"), "colour");
});

// ── Both renderers, against the same spec ───────────────────────────────────
//
// The toggle is only safe if both take identical input. A stub context records
// what each one asks for, which is enough to prove neither throws and that
// every field reaches the canvas.

function stubCanvas() {
  const drawn = { text: [], fills: 0, gradients: 0 };
  const ctx = {
    canvas: null,
    set font(v) { this._font = v; }, get font() { return this._font ?? "10px sans-serif"; },
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineJoin: "", lineCap: "", textBaseline: "",
    measureText: (t) => ({ width: String(t).length * 9 }),
    fillText: (t, x, y) => { drawn.text.push({ t: String(t), x, y }); },
    fillRect: () => { drawn.fills += 1; },
    strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, arcTo: () => {},
    ellipse: () => {}, fill: () => { drawn.fills += 1; }, stroke: () => {},
    save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
    createLinearGradient: () => { drawn.gradients += 1; return { addColorStop: () => {} }; },
  };
  return { canvas: { width: LABEL_W, height: LABEL_H, getContext: () => ctx }, drawn };
}

const DRAFT = {
  name: "Blue Dream", classification: "Hybrid", netWeight: "3.5 g",
  thc: "24.8", cbd: "0.6", harvested: "14 Jun 2026", packaged: "18 Sep 2026",
  batch: "BD-0614-A",
  terpenes: [{ name: "Myrcene", pct: "0.8%" }, { name: "Limonene", pct: "0.5%" }],
};

// A real qrMatrix is a 2D array of booleans; a fixed one is enough here.
function fakeMatrix(size = 25) {
  return {
    size,
    modules: Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => (r + c) % 3 === 0)),
  };
}

test("both labels draw the same spec without throwing", () => {
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  const spec = labelFields(DRAFT);
  for (const draw of [drawLabel, drawColorLabel]) {
    const { canvas } = stubCanvas();
    assert.doesNotThrow(() => draw(canvas, spec, fakeMatrix()));
  }
});

test("neither label loses a field the other keeps", () => {
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  const spec = labelFields(DRAFT);
  const said = (draw) => {
    const { canvas, drawn } = stubCanvas();
    draw(canvas, spec, fakeMatrix());
    return drawn.text.map((t) => t.t).join(" | ");
  };
  const plain = said(drawLabel);
  const colour = said(drawColorLabel);
  // Every value the grower typed has to survive both treatments. Flipping the
  // toggle changes how the jar looks, never what it claims.
  for (const value of ["Blue Dream", "3.5 g", "14 Jun 2026", "18 Sep 2026", "BD-0614-A"]) {
    assert.ok(plain.includes(value), `black and white label dropped ${value}`);
    assert.ok(colour.includes(value), `colour label dropped ${value}`);
  }
  // Both carry the potency, though only one gives it a bar of its own.
  assert.ok(/24\.8/.test(plain) && /24\.8/.test(colour));
});

test("a label with nothing but a name still draws on both", () => {
  globalThis.Path2D ??= class { constructor(d) { this.d = d; } };
  const spec = labelFields({ name: "Northern Lights" });
  for (const draw of [drawLabel, drawColorLabel]) {
    const { canvas, drawn } = stubCanvas();
    assert.doesNotThrow(() => draw(canvas, spec, null));
    assert.ok(drawn.text.some((t) => t.t === "Northern Lights"));
  }
});

test("the colour label draws inside a margin a desktop printer can hold", () => {
  // It is for a home inkjet or laser, neither of which prints to the trim, so
  // nothing may be drawn against the edge of the sheet.
  const src = new URL("../src/lib/growLabelColor.js", import.meta.url).pathname;
  const text = readFileSync(src, "utf8");
  const margin = /const MARGIN = (\d+)/.exec(text);
  assert.ok(margin, "MARGIN is gone");
  assert.ok(Number(margin[1]) >= 45, "a margin under 0.15in is inside what a tray can hold");
});
