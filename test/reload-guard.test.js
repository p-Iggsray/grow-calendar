import { test } from "node:test";
import assert from "node:assert/strict";
import { holdReload, reloadWhenIdle, reloadHolds, deferReloadWith } from "../src/lib/reloadGuard.js";

test("with nothing held, a new build loads at once", () => {
  let reloaded = 0;
  reloadWhenIdle(() => { reloaded += 1; });
  assert.equal(reloaded, 1);
});

test("an upload in progress holds the reload until it lets go", () => {
  let reloaded = 0;
  const a = holdReload();
  const b = holdReload();
  reloadWhenIdle(() => { reloaded += 1; });
  assert.equal(reloaded, 0);
  a();
  a();   // letting go twice changes nothing
  assert.equal(reloaded, 0, "one hold is still on");
  b();
  assert.equal(reloaded, 1);
  assert.equal(reloadHolds(), 0);
});

test("a reload that had to wait goes through the deferral, not straight off the release", () => {
  const scheduled = [];
  deferReloadWith((run) => scheduled.push(run));
  let reloaded = 0;
  const release = holdReload();
  reloadWhenIdle(() => { reloaded += 1; });
  release();
  assert.equal(reloaded, 0, "the upload's result is still on screen");
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(reloaded, 1);
  deferReloadWith((run) => run());
});

test("a waiting reload that comes due while something else holds goes back to waiting", () => {
  const scheduled = [];
  deferReloadWith((run) => scheduled.push(run));
  let reloaded = 0;
  const first = holdReload();
  reloadWhenIdle(() => { reloaded += 1; });
  first();
  // The picker opens for the next clip before the app is hidden.
  const picker = holdReload();
  scheduled.shift()();
  assert.equal(reloaded, 0, "never under an open picker");
  picker();
  scheduled.shift()();
  assert.equal(reloaded, 1);
  deferReloadWith((run) => run());
});
