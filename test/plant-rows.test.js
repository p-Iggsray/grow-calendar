import { test } from "node:test";
import assert from "node:assert/strict";
import { plantRef, withPlant, forEveryPlant, plantOfRow } from "../src/lib/plantRows.js";

test("plantRef carries the id alongside the trimmed name", () => {
  assert.deepEqual(plantRef({ id: "p1", name: "  Blue Dream " }), { plant: "Blue Dream", plantId: "p1" });
});

test("plantRef of a plant with no id keeps the name only", () => {
  assert.deepEqual(plantRef({ name: "Old row" }), { plant: "Old row" });
});

test("plantRef of nothing is an unattributed row, not all of them", () => {
  assert.deepEqual(plantRef(null), { plant: "" });
  assert.deepEqual(plantRef(undefined), { plant: "" });
  assert.deepEqual(plantRef({ name: "   " }), { plant: "" });
});

test("withPlant moves a row to another plant and drops the stale id", () => {
  const row = { plant: "A", plantId: "a", amount: 2, unit: "gal", gal: 2 };
  assert.deepEqual(
    withPlant(row, plantRef({ id: "b", name: "B" })),
    { plant: "B", plantId: "b", amount: 2, unit: "gal", gal: 2 },
  );
  // Unassigning must not leave the old id behind, or the row would still show
  // in that plant's history while claiming to be about nobody.
  assert.deepEqual(
    withPlant(row, plantRef(null)),
    { plant: "", amount: 2, unit: "gal", gal: 2 },
  );
});

test("withPlant keeps the id of a plant picked by name when the roster has no id", () => {
  assert.deepEqual(
    withPlant({ plant: "A", plantId: "a" }, plantRef({ name: "Legacy" })),
    { plant: "Legacy" },
  );
});

test("forEveryPlant writes one row per plant, each carrying its own id", () => {
  const rows = forEveryPlant(
    [{ id: "a", name: "A" }, { id: "b", name: "B" }, null],
    { action: "Defoliate" },
  );
  assert.deepEqual(rows, [
    { plant: "A", plantId: "a", action: "Defoliate" },
    { plant: "B", plantId: "b", action: "Defoliate" },
  ]);
});

test("plantOfRow matches by id first and name second", () => {
  const plants = [{ id: "a", name: "Alice" }, { id: "b", name: "Bob" }];
  assert.equal(plantOfRow({ plantId: "b", plant: "Alice" }, plants).id, "b");
  assert.equal(plantOfRow({ plant: "alice" }, plants).id, "a");
  assert.equal(plantOfRow({ plant: "" }, plants), null);
  assert.equal(plantOfRow({ plantId: "gone" }, plants), null);
});
