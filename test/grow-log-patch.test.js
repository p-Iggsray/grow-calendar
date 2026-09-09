import { test } from "node:test";
import assert from "node:assert/strict";
import { growLogPatch } from "../worker/growLog.js";

// The bug this pins: saving the Conditions card used to replace the whole row,
// so three typed numbers wiped the water, the feed and everything a reading of
// the day's written entry had filled in.
test("a save touches only the fields it sent", () => {
  const { cols, values } = growLogPatch({ temp_high: "78", temp_low: "66", humidity: "52" }, null);
  assert.deepEqual(cols, ["temp_high", "temp_low", "humidity"]);
  assert.deepEqual(values, [78, 66, 52]);
});

test("a field the body never mentions is not written at all", () => {
  const { cols } = growLogPatch({ humidity: "52" }, null);
  assert.ok(!cols.includes("water_gal"));
  assert.ok(!cols.includes("feed"));
  assert.ok(!cols.includes("water_plants"));
});

test("an explicitly emptied field is still written, as null", () => {
  // Clearing a box is an edit. Only an absent key means "leave it alone".
  const { cols, values } = growLogPatch({ feed: "" }, null);
  assert.deepEqual(cols, ["feed"]);
  assert.deepEqual(values, [null]);
});

test("only the saved fields stop being marked as read from the entry", () => {
  const was = JSON.stringify({ water: true, feed: true, humidity: true });
  const { readJson } = growLogPatch({ humidity: "52" }, was);
  assert.deepEqual(JSON.parse(readJson), { water: true, feed: true });
});

test("typing a watering by hand clears the mark on both of its columns", () => {
  // Watering is stored as a total and as a row per plant, but it was read once
  // and answers to one provenance key.
  const was = JSON.stringify({ water: true, feed: true });
  const { readJson } = growLogPatch({ water_plants: [{ plantId: 1, gal: 1 }] }, was);
  assert.deepEqual(JSON.parse(readJson), { feed: true });
});

test("an empty body writes nothing", () => {
  assert.deepEqual(growLogPatch({}, null).cols, []);
  assert.deepEqual(growLogPatch(null, null).cols, []);
});
