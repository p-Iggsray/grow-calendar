import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOptions, filterOptions, sameChoice } from "../src/lib/choices.js";
import { shapePlace } from "../worker/geocode.js";

test("sameChoice ignores case and padding", () => {
  assert.equal(sameChoice("LST", "lst"), true);
  assert.equal(sameChoice("  Topped ", "topped"), true);
  assert.equal(sameChoice("Topped", "FIM"), false);
  assert.equal(sameChoice(null, ""), true);
});

test("buildOptions lists presets, then remembered, then the current value", () => {
  const out = buildOptions(["Soil", "Coco"], ["My Custom Mix"], "Something Odd");
  assert.deepEqual(out, ["Soil", "Coco", "My Custom Mix", "Something Odd"]);
});

test("buildOptions never duplicates, whatever the casing", () => {
  const out = buildOptions(["Topped"], ["topped", "  TOPPED  "], "Topped");
  assert.deepEqual(out, ["Topped"]);
});

test("buildOptions keeps a saved value that is not a preset, and drops blanks", () => {
  assert.deepEqual(buildOptions(["A"], [], "Legacy value"), ["A", "Legacy value"]);
  assert.deepEqual(buildOptions(["A", "", null], [""], ""), ["A"]);
  assert.deepEqual(buildOptions(), []);
});

test("filterOptions matches anywhere, case-insensitively", () => {
  const opts = ["Fox Farm Trio", "General Hydroponics", "Jack's 321"];
  assert.deepEqual(filterOptions(opts, "farm"), ["Fox Farm Trio"]);
  assert.deepEqual(filterOptions(opts, "HYDRO"), ["General Hydroponics"]);
  assert.deepEqual(filterOptions(opts, ""), opts);
  assert.deepEqual(filterOptions(opts, "zzz"), []);
});

// ── Place search shaping ─────────────────────────────────────────────────────
test("shapePlace shortens long Nominatim names but keeps the country", () => {
  const p = shapePlace({
    lat: "39.95", lon: "-75.16",
    display_name: "Philadelphia, Philadelphia County, Pennsylvania, United States",
  });
  assert.equal(p.label, "Philadelphia, Philadelphia County, United States");
  assert.equal(p.full, "Philadelphia, Philadelphia County, Pennsylvania, United States");
  assert.equal(p.lat, 39.95);
  assert.equal(p.lon, -75.16);
});

test("shapePlace leaves already-short names alone", () => {
  assert.equal(shapePlace({ lat: "1", lon: "2", display_name: "Denver, Colorado" }).label, "Denver, Colorado");
});

test("shapePlace rejects hits without usable coordinates or a name", () => {
  assert.equal(shapePlace({ lat: "abc", lon: "2", display_name: "X" }), null);
  assert.equal(shapePlace({ lat: "1", lon: "2", display_name: "" }), null);
  assert.equal(shapePlace(null), null);
});
