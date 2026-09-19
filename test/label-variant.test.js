import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LABEL_VARIANTS, DEFAULT_VARIANT, normalizeVariant, variantSuffix,
} from "../src/lib/labelVariant.js";
import { labelFields } from "../src/lib/growLabel.js";
import { drawLabel, LABEL_W, LABEL_H } from "../src/lib/growLabel.js";
import { drawColorLabel } from "../src/lib/growLabelColor.js";
import { readFileSync, statSync } from "node:fs";

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

const colourSrc = readFileSync(
  new URL("../src/lib/growLabelColor.js", import.meta.url).pathname, "utf8");

test("the colour label is one flat colour, corner to corner", () => {
  // It bleeds on purpose: no white margin, no panel inside a border, and no
  // gradient on the ground. The ground is filled once, across the whole canvas.
  assert.match(colourSrc, /ctx\.fillStyle = INK;\s*\n\s*ctx\.fillRect\(0, 0, LABEL_W, LABEL_H\)/);
  assert.ok(!/const MARGIN/.test(colourSrc), "a margin would put white back on the outside");
});

test("the colour label leads with the font that is actually bundled", () => {
  const face = /const FACE =([\s\S]*?);\n/.exec(colourSrc);
  assert.ok(face, "FACE is gone");
  // Comic Neue ships with the app, so it is the only entry guaranteed to exist
  // on whatever device opens this. A system font leading the stack would put
  // the label back to looking different per platform.
  assert.match(face[1], /^\s*`"\$\{LABEL_FONT\}"/, "the bundled font has to lead the stack");
  for (const fallback of ["Comic Sans MS", "Chalkboard", "Marker Felt", "cursive"]) {
    assert.ok(face[1].includes(fallback), `the stack lost its ${fallback} fallback`);
  }
  assert.ok(!/Helvetica|Arial|Courier/.test(face[1]), "a plain fallback defeats the choice");
});

test("the bundled font is on disk, in both weights, with its licence", () => {
  // Every weight the label asks for needs a file behind it, and the OFL
  // requires the licence to travel with the font.
  const at = (f) => new URL(`../public/fonts/${f}`, import.meta.url).pathname;
  for (const f of ["comic-neue-400.woff2", "comic-neue-700.woff2"]) {
    assert.ok(statSync(at(f)).size > 5000, `${f} is missing or truncated`);
  }
  const licence = readFileSync(at("comic-neue-OFL.txt"), "utf8");
  assert.match(licence, /SIL Open Font License/);
});

test("every weight the label draws has a face declared for it", () => {
  // A weight with no @font-face resolves instantly and silently draws in the
  // fallback, which is the whole class of bug labelFont.js exists to stop.
  const css = readFileSync(new URL("../src/styles.css", import.meta.url).pathname, "utf8");
  const declared = new Set(
    [...css.matchAll(/@font-face\s*\{[^}]*?font-family:\s*"Comic Neue"[^}]*?font-weight:\s*(\d+)/gs)]
      .map((m) => Number(m[1])));
  const asked = new Set([...colourSrc.matchAll(/`(\d00) /g)].map((m) => Number(m[1])));
  for (const w of asked) {
    assert.ok(declared.has(w), `the label draws at weight ${w} with no @font-face for it`);
  }
});

test("the label waits for the font before it draws", () => {
  // Canvas does not wait and does not complain: without this the colour label
  // silently renders in the fallback on a cold open.
  const sheet = readFileSync(
    new URL("../src/components/StrainLabel.jsx", import.meta.url).pathname, "utf8");
  assert.match(sheet, /await ensureLabelFont\(\)/);
  const fontSrc = readFileSync(
    new URL("../src/lib/labelFont.js", import.meta.url).pathname, "utf8");
  // And it must never reject: a font that fails to load is a label in the
  // fallback, not an empty preview.
  assert.match(fontSrc, /catch\s*\{\s*\n?\s*return false;/);
});

test("nothing asks for a weight the font does not ship", () => {
  // Comic Sans has Regular and Bold and nothing else. Asking for 800 makes the
  // browser smear the bold one, which shows at 300dpi.
  const weights = [...colourSrc.matchAll(/`(\d00) /g)].map((m) => Number(m[1]));
  const tooHeavy = [...new Set(weights)].filter((w) => w > 700);
  assert.deepEqual(tooHeavy, [], `weights above 700 get synthesised: ${tooHeavy.join(", ")}`);
});
