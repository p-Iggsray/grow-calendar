import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASES, phaseGlyph } from "../src/lib/growData.js";

test("every PHASES entry has a glyph defined (empty allowed only for 'pre')", () => {
  for (const key of Object.keys(PHASES)) {
    const g = phaseGlyph(key);
    if (key === "pre") assert.equal(g, "", `'pre' should be glyph-less`);
    else assert.ok(g.length > 0, `phase ${key} should have a glyph`);
  }
});

test("phaseGlyph returns empty string for unknown / null / undefined", () => {
  assert.equal(phaseGlyph(null), "");
  assert.equal(phaseGlyph(undefined), "");
  assert.equal(phaseGlyph("not_a_phase"), "");
});

test("strain-pair phases share the same glyph (color disambiguates strain, glyph distinguishes phase type)", () => {
  assert.equal(phaseGlyph("harvest_gdp"), phaseGlyph("harvest_haze"));
  assert.equal(phaseGlyph("flower"), phaseGlyph("flower_haze"));
  assert.equal(phaseGlyph("flush_gdp"), phaseGlyph("flush_haze"));
});
