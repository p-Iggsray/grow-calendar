import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Keyboard and switch-control users navigate by focus ring. One global
// :focus-visible rule in styles.css draws it; anything that kills an outline
// takes that feedback away, and an inline style kills it in a way no
// stylesheet can win back without !important. So: no outline suppression
// anywhere in the app, full stop.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const SRC = new URL("../src", import.meta.url).pathname;
const css = readFileSync(new URL("../src/styles.css", import.meta.url).pathname, "utf8");

test("no component kills a focus outline from an inline style", () => {
  const offenders = [];
  for (const file of walk(SRC).filter((f) => /\.jsx?$/.test(f))) {
    const text = readFileSync(file, "utf8");
    for (const [i, line] of text.split("\n").entries()) {
      if (/outline\s*:\s*("none"|'none'|0)/.test(line)) {
        offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `outline suppressed inline at: ${offenders.join(", ")}`);
});

test("styles.css only drops a ring where a parent shows one instead", () => {
  for (const [, selector, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    if (!/outline\s*:\s*(none|0)\b/.test(body)) continue;
    const root = selector.trim().split(/[\s:]/)[0];
    assert.ok(
      root && new RegExp(`\\${root}:focus-within`).test(css),
      `${selector.trim()} drops its ring with no :focus-within replacement`,
    );
  }
});

test("styles.css defines one global focus-visible ring", () => {
  const rule = css.match(/\n:focus-visible \{([^}]*)\}/);
  assert.ok(rule, "expected a bare :focus-visible rule at the top level");
  assert.match(rule[1], /outline:\s*2px solid var\(--c-accent\)/);
  assert.match(rule[1], /outline-offset:\s*2px/);
});

test("the ring colour clears 3:1 against the page and a card", () => {
  const lum = ([r, g, b]) => {
    const f = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const hex = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, "i"));
    assert.ok(m, `token --${name} not found`);
    return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  };
  // The card fill is the surface token composited over the page background.
  const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));
  const bg = hex("c-bg");
  const accent = hex("c-accent");
  const surface = css.match(/--c-surface-1:\s*rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  assert.ok(surface, "--c-surface-1 not found");
  const card = over(surface.slice(1, 4).map(Number), Number(surface[4]), bg);

  assert.ok(ratio(accent, bg) >= 3, `ring on background is ${ratio(accent, bg).toFixed(2)}:1`);
  assert.ok(ratio(accent, card) >= 3, `ring on a card is ${ratio(accent, card).toFixed(2)}:1`);
});
