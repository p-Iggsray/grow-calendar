import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The device asks for less motion; the app has to actually listen.
//
// Two halves, and the CSS one was the only one that existed. Framer Motion
// animates by writing inline styles from JavaScript, so `transition: none`
// never touched a single one of its twenty-five components.

const SRC = new URL("../src", import.meta.url).pathname;
const css = readFileSync(join(SRC, "styles.css"), "utf8");
const main = readFileSync(join(SRC, "main.jsx"), "utf8");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("one switch covers every motion component", () => {
  // reducedMotion="user" drops transform and layout animations across the whole
  // tree when the device asks, and leaves opacity alone. Without it, each of
  // the twenty-five would have to remember on its own, and twenty-one did not.
  assert.match(main, /<MotionConfig reducedMotion="user">/);
  assert.match(main, /import \{[^}]*\bMotionConfig\b[^}]*\} from "framer-motion"/);
});

test("the switch wraps both apps, including the friend view", () => {
  // The friend view runs on somebody else's device and their setting counts.
  const open = main.indexOf("<MotionConfig");
  const close = main.indexOf("</MotionConfig>");
  assert.ok(open > 0 && close > open, "MotionConfig is not a wrapper");
  const inside = main.slice(open, close);
  assert.ok(inside.includes("<BuddyView"), "the friend view is outside the switch");
  assert.ok(inside.includes("<Root />"), "the app is outside the switch");
});

test("nothing animates from an inline style", () => {
  // An inline style beats every stylesheet rule, so an animation written at the
  // call site cannot be turned off by the reduced-motion block. This is the
  // same trap the focus rings were in.
  const offenders = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      if (/\banimation:\s*["'`]/.test(line)) {
        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `inline animations at: ${offenders.join(", ")}`);
});

test("every class the app spins has a rule behind it", () => {
  // `className="spin"` sat in the label sheet with no .spin rule anywhere, so
  // that spinner never moved. A class that names an animation has to exist.
  const used = new Set();
  for (const file of walk(SRC)) {
    for (const m of readFileSync(file, "utf8").matchAll(/className="([^"]*\bspin\b[^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) used.add(c);
    }
  }
  assert.ok(used.has("spin"), "nothing uses the spin class any more");
  for (const cls of used) {
    assert.match(css, new RegExp(`\\.${cls}\\s*\\{`), `.${cls} is used but never defined`);
  }
});

test("a spinner keeps saying it is working without rotating", () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(block, "the reduced-motion block is gone");
  // Frozen reads as a hung app, so it breathes instead.
  assert.match(block[1], /\.spin\s*\{[^}]*animation:\s*spinner-pulse/);
  assert.match(css, /@keyframes spinner-pulse/);
  // And the pulse has to be opacity only: a scaling pulse is still movement.
  const pulse = /@keyframes spinner-pulse \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(!/transform|scale|rotate/.test(pulse[1]), "the pulse moves rather than fades");
});

test("the CSS half still covers what CSS can reach", () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)[1];
  for (const rule of [".cell-today", ".skeleton"]) {
    assert.match(block, new RegExp(`\\${rule}\\s*\\{[^}]*animation:\\s*none`), `${rule} still animates`);
  }
  assert.match(block, /\*\s*\{\s*transition:\s*none\s*!important/);
});

test("every looping CSS animation is switched off or swapped", () => {
  // A keyframe animation that loops forever and is never mentioned in the
  // reduced-motion block is motion nobody can stop.
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)[1];
  const looping = [...css.matchAll(/([.\w-]+)\s*\{[^}]*animation:\s*([\w-]+)[^;]*infinite/g)]
    .map((m) => ({ selector: m[1], name: m[2] }));
  assert.ok(looping.length > 0, "the scan found no looping animations, so it is not scanning");
  for (const { selector, name } of looping) {
    if (name === "spinner-pulse") continue;          // it IS the replacement
    assert.match(block, new RegExp(`\\${selector}\\s*\\{`),
      `${selector} loops ${name} forever and the reduced-motion block never mentions it`);
  }
});
