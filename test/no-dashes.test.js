import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The app must never show an em dash or en dash. Source (strings, JSX text,
// even comments) is kept fully dash-free so nothing can leak into the UI;
// content stored in the DB is scrubbed at render time (getDetail + Bubble).
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

test("no em or en dashes anywhere in app source", () => {
  const roots = ["src", "worker"];
  const offenders = [];
  for (const root of roots) {
    for (const file of walk(new URL(`../${root}`, import.meta.url).pathname)) {
      const text = readFileSync(file, "utf8");
      if (/[–—]/.test(text)) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `em/en dashes found in: ${offenders.join(", ")}`);
});

test("golden plan fixture is dash-free", () => {
  const golden = readFileSync(new URL("./golden-plan.json", import.meta.url), "utf8");
  assert.ok(!/[–—]/.test(golden));
});
