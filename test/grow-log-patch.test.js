import { test } from "node:test";
import assert from "node:assert/strict";
import { growLogPatch } from "../worker/growLog.js";

// The bug this pins: saving the Conditions card used to replace the whole row,
// so three typed numbers wiped the water and the feed.
test("a save touches only the fields it sent", () => {
  const { cols, values } = growLogPatch({ temp_high: "78", temp_low: "66", humidity: "52" });
  assert.deepEqual(cols, ["temp_high", "temp_low", "humidity"]);
  assert.deepEqual(values, [78, 66, 52]);
});

test("a field the body never mentions is not written at all", () => {
  const { cols } = growLogPatch({ humidity: "52" });
  assert.ok(!cols.includes("water_gal"));
  assert.ok(!cols.includes("feed"));
  assert.ok(!cols.includes("water_plants"));
});

test("an explicitly emptied field is still written, as null", () => {
  // Clearing a box is an edit. Only an absent key means "leave it alone".
  const { cols, values } = growLogPatch({ feed: "" });
  assert.deepEqual(cols, ["feed"]);
  assert.deepEqual(values, [null]);
});

test("an empty body writes nothing", () => {
  assert.deepEqual(growLogPatch({}).cols, []);
  assert.deepEqual(growLogPatch(null).cols, []);
});
