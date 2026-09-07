import { test } from "node:test";
import assert from "node:assert/strict";
import { readingToLogPatch, mergeReading, matchPlant } from "../src/lib/entryReading.js";

// A reading is a claim about what somebody wrote. These tests pin what is
// allowed to survive the trip from a model's answer into a permanent record.

const PLANTS = [
  { id: "p1", name: "Blue Dream", status: "growing" },
  { id: "p2", name: "Gelato", status: "growing" },
  { id: "p3", name: "Old Girl", status: "harvested" },
];

test("a reading that found nothing patches nothing", () => {
  const r = readingToLogPatch({}, { plants: PLANTS, crop: "cannabis" });
  assert.deepEqual(r.patch, {});
  assert.deepEqual(r.read, {});
  assert.equal(r.found, false);
  assert.equal(readingToLogPatch(null, {}).found, false);
});

test("'they all got 3 L' becomes one watering per growing plant", () => {
  const { patch, read } = readingToLogPatch(
    { water: { amount: 3, unit: "l", per_plant: true } },
    { plants: PLANTS, crop: "cannabis" },
  );
  assert.equal(patch.water_plants.length, 2, "the harvested plant is not watered");
  assert.deepEqual(patch.water_plants.map((r) => r.plant), ["Blue Dream", "Gelato"]);
  assert.equal(patch.water_plants[0].amount, 3);
  assert.equal(patch.water_plants[0].unit, "l");
  assert.ok(Math.abs(patch.water_gal - 3 * 2 / 3.785411784) < 0.01);
  assert.equal(read.water, true);
});

test("a named plant wins over a per-plant reading, and gets its real id", () => {
  const { patch } = readingToLogPatch(
    { water: { amount: 2, unit: "l", per_plant: true, plants: ["blue dream"] } },
    { plants: PLANTS, crop: "cannabis" },
  );
  assert.equal(patch.water_plants.length, 1);
  assert.equal(patch.water_plants[0].plant, "Blue Dream", "the roster's spelling wins");
  assert.equal(patch.water_plants[0].plantId, "p1");
});

test("a plant nobody has is recorded as text, never attributed to a real one", () => {
  const { patch } = readingToLogPatch(
    { water: { amount: 1, unit: "gal", plants: ["Wedding Cake"] } },
    { plants: PLANTS, crop: "cannabis" },
  );
  assert.equal(patch.water_plants[0].plant, "Wedding Cake");
  assert.equal(patch.water_plants[0].plantId, undefined);
});

test("a watering naming nobody is a whole-space watering, not an empty row", () => {
  const { patch } = readingToLogPatch(
    { water: { amount: 500, unit: "ml" } },
    { plants: PLANTS, crop: "mushrooms" },
  );
  assert.equal(patch.water_plants.length, 1);
  assert.equal(patch.water_plants[0].plant, "");
  assert.equal(patch.water_plants[0].amount, 500);
});

test("nonsense numbers are dropped rather than recorded", () => {
  const { patch, read } = readingToLogPatch(
    { temp_high: 850, temp_low: 71, humidity: 300, water: { amount: -5, unit: "l" } },
    { plants: PLANTS, crop: "cannabis" },
  );
  assert.equal(patch.temp_high, undefined, "850F is a misread sentence");
  assert.equal(patch.humidity, undefined, "300% is not a humidity");
  assert.equal(patch.water_plants, undefined, "negative water is not a watering");
  assert.equal(patch.temp_low, 71, "the believable one survives");
  assert.deepEqual(Object.keys(read), ["temp_low"]);
});

test("an unknown unit falls back to gallons rather than being invented", () => {
  const { patch } = readingToLogPatch(
    { water: { amount: 2, unit: "buckets" } },
    { plants: PLANTS, crop: "cannabis" },
  );
  assert.equal(patch.water_plants[0].unit, "gal");
});

test("health rows keep colour, trichomes and notes, and drop the empty ones", () => {
  const { patch, read } = readingToLogPatch({
    health: [
      { plant: "Blue Dream", trichomes: "mostly cloudy", notes: "maybe 10% amber" },
      { plant: "Gelato" },
    ],
  }, { plants: PLANTS, crop: "cannabis" });
  assert.equal(patch.plant_health.length, 1, "a row with nothing observed is not a row");
  assert.equal(patch.plant_health[0].plantId, "p1");
  assert.equal(patch.plant_health[0].trichomes, "mostly cloudy");
  assert.equal(patch.plant_health[0].color, undefined);
  assert.equal(read.plant_health, true);
});

test("training needs an action to be a row", () => {
  const { patch } = readingToLogPatch({
    training: [{ plant: "Gelato", action: "topped" }, { plant: "Blue Dream", action: "  " }],
  }, { plants: PLANTS, crop: "cannabis" });
  assert.equal(patch.training.length, 1);
  assert.equal(patch.training[0].action, "topped");
});

test("feed is trimmed, collapsed and capped", () => {
  const { patch } = readingToLogPatch({ feed: "  cal-mag,   half   dose \n" }, { plants: PLANTS });
  assert.equal(patch.feed, "cal-mag, half dose");
  assert.equal(readingToLogPatch({ feed: "   " }, {}).found, false);
});

test("matchPlant is case-insensitive and never guesses", () => {
  assert.equal(matchPlant("BLUE DREAM", PLANTS).id, "p1");
  assert.equal(matchPlant("blue", PLANTS), null, "a partial name is not a match");
  assert.equal(matchPlant("", PLANTS), null);
});

// ── merging over what is already there ──────────────────────────────────────

test("a reading fills a blank field", () => {
  const out = mergeReading({ feed: null }, { feed: "cal-mag" }, {});
  assert.equal(out.feed, "cal-mag");
});

test("a reading never overwrites a value you typed yourself", () => {
  const out = mergeReading({ humidity: 55 }, { humidity: 80 }, {});
  assert.equal(out.humidity, 55, "the typed reading stands");
});

test("a reading does overwrite a value an earlier reading put there", () => {
  const out = mergeReading({ humidity: 55 }, { humidity: 80 }, { humidity: true });
  assert.equal(out.humidity, 80, "re-reading an edited entry updates its own work");
});

test("re-reading replaces the water it wrote, total and rows together", () => {
  const before = { water_gal: 1, water_plants: [{ plant: "Blue Dream", amount: 1, unit: "gal", gal: 1 }] };
  const patch = { water_gal: 2, water_plants: [{ plant: "Blue Dream", amount: 2, unit: "gal", gal: 2 }] };
  const out = mergeReading(before, patch, { water: true });
  assert.equal(out.water_gal, 2);
  assert.equal(out.water_plants[0].amount, 2);
});

test("an empty list counts as blank and gets filled", () => {
  const out = mergeReading({ training: [] }, { training: [{ plant: "A", action: "topped" }] }, {});
  assert.equal(out.training.length, 1);
});
