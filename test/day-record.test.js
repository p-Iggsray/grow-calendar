import { test } from "node:test";
import assert from "node:assert/strict";
import { recordRows, climateLine } from "../src/lib/dayRecord.js";

// The head of a journal page prints what was logged, in the words and units it
// was logged in, and prints nothing where nothing was logged.

test("an empty day has no record rows at all", () => {
  assert.deepEqual(recordRows({}), []);
  assert.deepEqual(recordRows({ log: null, weather: null }), []);
  assert.deepEqual(recordRows(), []);
});

test("water is listed plant by plant, in each plant's own unit", () => {
  const [row] = recordRows({
    crop: "cannabis",
    log: {
      water_plants: [
        { plant: "Blue Dream", amount: 3, unit: "l", gal: 0.79 },
        { plant: "Gelato", amount: 2, unit: "l", gal: 0.53 },
      ],
    },
  });
  assert.equal(row.key, "water");
  assert.deepEqual(row.items, [
    { name: "Blue Dream", amount: "3 L" },
    { name: "Gelato", amount: "2 L" },
  ]);
});

test("a watering that names no plant is the whole space, not an empty row", () => {
  const [row] = recordRows({
    crop: "mushrooms",
    log: { water_plants: [{ plant: "", amount: 250, unit: "ml", gal: 0.066 }] },
  });
  assert.equal(row.items[0].name, "All tubs");
  assert.equal(row.items[0].amount, "250 mL");
});

test("the label follows the crop", () => {
  const cannabis = recordRows({ crop: "cannabis", log: { water_plants: [{ plant: "A", amount: 1, unit: "gal", gal: 1 }] } });
  const mush = recordRows({ crop: "mushrooms", log: { water_plants: [{ plant: "A", amount: 50, unit: "ml", gal: 0.013 }] } });
  assert.notEqual(cannabis[0].label, mush[0].label);
});

test("a day with only a total still reports the total", () => {
  const [row] = recordRows({ crop: "cannabis", log: { water_gal: 2, water_plants: [] } });
  assert.equal(row.key, "water");
  assert.equal(row.items.length, 1);
  assert.match(row.items[0].amount, /^2 gal$/);
});

test("a zero total is not a watering", () => {
  assert.deepEqual(recordRows({ crop: "cannabis", log: { water_gal: 0, water_plants: [] } }), []);
});

test("a blank feed is not a row", () => {
  assert.deepEqual(recordRows({ log: { feed: "   " } }), []);
  assert.equal(recordRows({ log: { feed: "Fish mix 5ml/L" } })[0].text, "Fish mix 5ml/L");
});

test("the space's own reading beats the forecast, and says which it was", () => {
  const own = climateLine({ temp_high: 78, temp_low: 66, humidity: 55 }, { high: 91, low: 70, humidity: 30 });
  assert.equal(own.source, "logged");
  assert.equal(own.text, "78° / 66° · 55% RH");

  const sky = climateLine({ water_gal: 1 }, { high: 91, low: 70, humidity: 30 });
  assert.equal(sky.source, "forecast");
  assert.equal(sky.text, "91° / 70° · 30% RH");
});

test("humidity on its own is still a climate line", () => {
  assert.equal(climateLine({ humidity: 88 }, null).text, "88% RH");
  assert.equal(climateLine(null, null), null);
  assert.equal(climateLine({ feed: "x" }, {}), null);
});

test("rows come out in reading order: water, feed, climate", () => {
  const rows = recordRows({
    crop: "cannabis",
    log: { water_plants: [{ plant: "A", amount: 1, unit: "gal", gal: 1 }], feed: "Cal-mag", humidity: 50 },
  });
  assert.deepEqual(rows.map((r) => r.key), ["water", "feed", "climate"]);
});
