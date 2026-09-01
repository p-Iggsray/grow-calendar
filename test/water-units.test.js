import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WATER_UNITS, DEFAULT_WATER_UNIT, isWaterUnit, unitLabel,
  toGallons, fromGallons, formatWater, rowDisplay, waterRow, sumGallons,
} from "../src/lib/waterUnits.js";

// Gallons are canonical: they are the only thing summed, and the only thing
// already-stored rows contain. These tests pin that contract.

test("the three units convert against gallons correctly", () => {
  assert.equal(toGallons(1, "gal"), 1);
  assert.ok(Math.abs(toGallons(3.785411784, "l") - 1) < 1e-9);
  assert.ok(Math.abs(toGallons(3785.411784, "ml") - 1) < 1e-9);
});

test("converting out and back is lossless enough to trust", () => {
  for (const unit of ["gal", "l", "ml"]) {
    const gal = toGallons(2, unit);
    assert.ok(Math.abs(fromGallons(gal, unit) - 2) < 0.01, unit);
  }
});

test("blank and junk amounts are null, not zero or NaN", () => {
  for (const bad of ["", null, undefined, "abc", NaN]) {
    assert.equal(toGallons(bad, "gal"), null);
  }
  assert.equal(fromGallons(null, "l"), null);
  assert.equal(formatWater("", "gal"), "");
});

test("each unit rounds to what is worth showing", () => {
  assert.equal(formatWater(1, "gal"), "1 gal");
  assert.equal(formatWater(1, "l"), "3.79 L");
  // Millilitres are never fractional.
  assert.equal(formatWater(1, "ml"), "3785 mL");
  assert.match(formatWater(0.5, "ml"), /^\d+ mL$/);
});

test("an unknown unit falls back to gallons rather than breaking", () => {
  assert.equal(isWaterUnit("cups"), false);
  assert.equal(unitLabel("cups"), "gal");
  assert.equal(toGallons(2, "cups"), 2);
  assert.equal(DEFAULT_WATER_UNIT, "gal");
  assert.equal(WATER_UNITS.length, 3);
});

// ── Rows ─────────────────────────────────────────────────────────────────────
test("a row keeps the number that was typed, not a converted decimal", () => {
  const row = waterRow({ plant: "Blue Dream" }, "500", "ml");
  assert.equal(row.amount, "500");
  assert.equal(row.unit, "ml");
  assert.ok(Math.abs(row.gal - 0.1321) < 0.001);
  // And reads straight back as 500 mL, not 0.13 gal.
  assert.deepEqual(rowDisplay(row), { amount: 500, unit: "ml" });
  assert.equal(row.plant, "Blue Dream");
});

test("a row written before units existed still reads as gallons", () => {
  assert.deepEqual(rowDisplay({ plant: "X", gal: 2 }), { amount: 2, unit: "gal" });
  assert.deepEqual(rowDisplay({ gal: "1.5" }), { amount: 1.5, unit: "gal" });
});

test("an empty row reads as nothing rather than zero", () => {
  assert.equal(rowDisplay({}).amount, null);
  assert.equal(rowDisplay({ gal: "" }).amount, null);
  assert.equal(waterRow({}, "", "l").gal, "");
});

test("mixed units add up, which is the whole point of storing gallons", () => {
  const rows = [
    waterRow({ plant: "A" }, "1", "gal"),
    waterRow({ plant: "B" }, "3.785411784", "l"),   // == 1 gal
    waterRow({ plant: "C" }, "3785.411784", "ml"),  // == 1 gal
  ];
  assert.ok(Math.abs(sumGallons(rows) - 3) < 0.001);
  // The same three waterings, read out in litres.
  assert.equal(formatWater(sumGallons(rows), "l"), "11.36 L");
});

test("summing ignores rows with no amount and legacy rows still count", () => {
  assert.equal(sumGallons([{ gal: 2 }, { gal: "" }, {}, { gal: 1 }]), 3);
  assert.equal(sumGallons([]), 0);
  assert.equal(sumGallons(null), 0);
});
