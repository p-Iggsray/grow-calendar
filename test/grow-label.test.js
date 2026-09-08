import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFields, labelDate, LABEL_W, LABEL_H } from "../src/lib/growLabel.js";

// A label has no room for blanks, so the rule under all of this is: a field
// with nothing behind it is left off, never printed empty.

const BLUE = {
  name: "Blue Dream", crop: "cannabis", type: "hybrid", photo: true,
  flowerWeeks: 9, rating: 4, note: "Sweet, heavy yield, easy feeder.",
  lastGrown: "2026-09-06", grows: [{ growName: "Tent One" }],
};

test("the sheet is six by four inches at 300dpi", () => {
  assert.equal(LABEL_W, 1800);
  assert.equal(LABEL_H, 1200);
  assert.equal(LABEL_W / LABEL_H, 1.5);
});

test("dates print as a person writes them, and junk prints as nothing", () => {
  assert.equal(labelDate("2026-09-06"), "6 Sep 2026");
  assert.equal(labelDate("2026-01-31"), "31 Jan 2026");
  assert.equal(labelDate("not a date"), null);
  assert.equal(labelDate(null), null);
  assert.equal(labelDate("2026-13-01"), null, "an impossible month is not a date");
});

test("an empty strain still yields a printable label", () => {
  const f = labelFields({}, {}, null);
  assert.equal(f.name, "Unnamed");
  assert.deepEqual(f.rows, []);
  assert.equal(f.rating, 0);
  assert.equal(f.note, null);
});

test("fields with nothing behind them are left off, not printed empty", () => {
  const f = labelFields({ name: "Mystery", crop: "cannabis" }, {}, null);
  assert.equal(f.rows.length, 0, "no weight, no potency, no dates, no rows");
  const g = labelFields(BLUE, { netWeight: "3.5 g" }, "2026-09-08");
  assert.ok(g.rows.some((r) => r.label === "Net weight"));
  assert.ok(!g.rows.some((r) => r.label === "THC"), "no potency typed, so no potency row");
});

test("potency reads as one row when both are given and one when not", () => {
  const both = labelFields(BLUE, { thc: "22.4%", cbd: "0.1%" }, null);
  assert.equal(both.rows.find((r) => r.label === "THC / CBD").value, "22.4%  /  0.1%");
  const thcOnly = labelFields(BLUE, { thc: "22.4%" }, null);
  assert.equal(thcOnly.rows.find((r) => r.label === "THC").value, "22.4%");
  const cbdOnly = labelFields(BLUE, { cbd: "8%" }, null);
  assert.equal(cbdOnly.rows.find((r) => r.label === "CBD").value, "8%");
});

test("rows come out in the order a label is read", () => {
  const f = labelFields(BLUE, { netWeight: "3.5 g", thc: "22%", cbd: "0.1%" }, "2026-09-08");
  assert.deepEqual(f.rows.map((r) => r.label),
    ["Net weight", "THC / CBD", "Harvested", "Packaged", "Grown in", "Flower time"]);
});

test("the kind line never says photoperiod twice", () => {
  const f = labelFields({ name: "X", crop: "cannabis", type: "photo", photo: true }, {}, null);
  assert.equal(f.subtitle.split("Photoperiod").length - 1, 1);
});

test("a tub is labelled in mushroom words and never claims a flower time", () => {
  const f = labelFields(
    { name: "Golden Teacher", crop: "mushrooms", type: "cube", flowerWeeks: 4, lastGrown: "2026-09-06" },
    {}, "2026-09-08",
  );
  assert.match(f.subtitle, /Mushrooms/);
  assert.ok(!f.rows.some((r) => r.label === "Flower time"), "a tub does not flower");
  assert.match(f.subtitle, /Cubensis/);
});

test("ratings are clamped to whole stars, and zero means unrated", () => {
  assert.equal(labelFields({ rating: 4.4 }, {}, null).rating, 4);
  assert.equal(labelFields({ rating: 99 }, {}, null).rating, 5);
  assert.equal(labelFields({ rating: -3 }, {}, null).rating, 0);
  assert.equal(labelFields({ rating: null }, {}, null).rating, 0);
});

test("long values are cut rather than allowed to run off the stock", () => {
  const f = labelFields(
    { name: "N".repeat(200), note: "x".repeat(500), grows: [{ growName: "G".repeat(90) }] },
    { netWeight: "w".repeat(90) }, null,
  );
  assert.ok(f.name.length <= 40);
  assert.ok(f.note.length <= 150);
  assert.ok(f.rows.find((r) => r.label === "Net weight").value.length <= 24);
  assert.ok(f.rows.find((r) => r.label === "Grown in").value.length <= 28);
});

test("whitespace-only input counts as absent", () => {
  const f = labelFields({ name: "  ", note: "   " }, { netWeight: "  ", thc: "\n" }, null);
  assert.equal(f.name, "Unnamed");
  assert.equal(f.note, null);
  assert.deepEqual(f.rows, []);
});

test("the most recent space is the one named on the label", () => {
  const f = labelFields(
    { ...BLUE, grows: [{ growName: "Old Tent" }, { growName: "Tent Two" }] }, {}, null,
  );
  assert.equal(f.rows.find((r) => r.label === "Grown in").value, "Tent Two");
});

test("an explicit note beats the strain's own", () => {
  assert.equal(labelFields(BLUE, { note: "Batch note" }, null).note, "Batch note");
  assert.equal(labelFields(BLUE, {}, null).note, BLUE.note);
});
