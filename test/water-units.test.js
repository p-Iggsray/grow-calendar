import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WATER_UNITS, DEFAULT_WATER_UNIT, isWaterUnit, unitLabel,
  toGallons, fromGallons, formatWater, rowDisplay, waterRow, sumGallons,
  displayUnit, fanOutWater, mergeWaterRows,
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

// ── Reading a day back in the unit it was logged in ──────────────────────────
test("a day logged in litres reads out in litres, whatever unit is in hand", () => {
  const rows = [waterRow({ plant: "A" }, "3", "l"), waterRow({ plant: "B" }, "3", "l")];
  assert.equal(displayUnit(rows, "gal"), "l");
  assert.equal(formatWater(sumGallons(rows), displayUnit(rows, "gal")), "6 L");
});

test("litres and millilitres together read as litres", () => {
  const rows = [waterRow({ plant: "A" }, "1", "l"), waterRow({ plant: "B" }, "500", "ml")];
  assert.equal(displayUnit(rows), "l");
  // A gallon row anywhere in the day makes gallons the coarsest unit used.
  assert.equal(displayUnit([...rows, waterRow({ plant: "C" }, "1", "gal")]), "gal");
  assert.equal(displayUnit([waterRow({ plant: "A" }, "250", "ml")]), "ml");
});

test("rows from before units existed read as the gallons they hold", () => {
  assert.equal(displayUnit([{ plant: "A", gal: 2 }], "l"), "gal");
  // Nothing recognisable: the fallback decides, and null asks for null back.
  assert.equal(displayUnit([{ plant: "A" }], "l"), "l");
  assert.equal(displayUnit([], "ml"), "ml");
  assert.equal(displayUnit([], null), null);
});

// ── Watering every plant at once ─────────────────────────────────────────────
test("one amount for all plants becomes one watering per plant", () => {
  const plants = [{ id: "p_1", name: "Blue Dream" }, { id: "p_2", name: "Gelato" }, { id: "p_3", name: "Zkittlez" }];
  const rows = fanOutWater(plants, 3, "l");

  assert.equal(rows.length, 3);
  for (const row of rows) {
    // Each plant is recorded as having had the full 3 L, not a share of it.
    assert.deepEqual(rowDisplay(row), { amount: 3, unit: "l" });
  }
  assert.deepEqual(rows.map(r => r.plant), ["Blue Dream", "Gelato", "Zkittlez"]);
  assert.deepEqual(rows.map(r => r.plantId), ["p_1", "p_2", "p_3"]);
  // Three plants at 3 L each is nine litres of water, and the day says so.
  assert.equal(formatWater(sumGallons(rows), displayUnit(rows)), "9 L");
});

test("a plant with no id still gets its row, matched by name", () => {
  const rows = fanOutWater([{ name: "Unnamed strain" }], "500", "ml");
  assert.equal(rows[0].plant, "Unnamed strain");
  assert.equal("plantId" in rows[0], false);
  assert.equal(fanOutWater(null, 1, "l").length, 0);
});

test("watering them all again replaces those rows rather than doubling them", () => {
  const plants = [{ id: "p_1", name: "A" }, { id: "p_2", name: "B" }];
  const day = [
    ...fanOutWater(plants, 2, "l"),
    waterRow({ plant: "Retired plant", plantId: "p_9" }, 1, "l"),
  ];
  const merged = mergeWaterRows(day, fanOutWater(plants, 3, "l"));

  assert.equal(merged.length, 3);
  // The untouched plant keeps exactly what it had.
  assert.deepEqual(rowDisplay(merged[0]), { amount: 1, unit: "l" });
  assert.equal(merged[0].plant, "Retired plant");
  assert.deepEqual(merged.slice(1).map(r => rowDisplay(r).amount), [3, 3]);
});

test("merging matches a row that only ever had a plant name", () => {
  const merged = mergeWaterRows(
    [waterRow({ plant: "Blue Dream" }, 1, "gal"), waterRow({ plant: "" }, 2, "gal")],
    fanOutWater([{ id: "p_1", name: "blue dream" }], 3, "l"),
  );
  assert.equal(merged.length, 2);
  // The whole-grow row (no plant named) is not what "Blue Dream" replaces.
  assert.equal(merged[0].plant, "");
  assert.deepEqual(rowDisplay(merged[1]), { amount: 3, unit: "l" });
});
