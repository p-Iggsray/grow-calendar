import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFields, labelDraft, cleanTerpenes, labelDate, LABEL_W, LABEL_H } from "../src/lib/growLabel.js";

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

// ── The draft: what the app prefills, and what it leaves to the grower ──────

test("the draft prefills only what the app actually knows", () => {
  const d = labelDraft(BLUE, { growName: "Tent Two", growId: "g2" }, "2026-09-08");
  assert.equal(d.name, "Blue Dream");
  assert.match(d.classification, /Hybrid/);
  assert.equal(d.harvested, "6 Sep 2026");
  assert.equal(d.packaged, "8 Sep 2026");
  assert.equal(d.grownIn, "Tent Two", "the plant's own space, not the strain's first");
  // The app cannot know these, so it does not pretend to.
  assert.equal(d.netWeight, "");
  assert.equal(d.thc, "");
  assert.equal(d.cbd, "");
  assert.equal(d.batch, "");
  assert.deepEqual(d.terpenes, []);
});

test("every printed value comes from the draft, so every one can be edited", () => {
  const f = labelFields({
    name: "Renamed By Hand", classification: "Indica",
    netWeight: "7 g", thc: "18%", cbd: "2%",
    harvested: "1 Jan 2026", packaged: "2 Jan 2026",
    grownIn: "Somewhere else", batch: "XX-1",
  });
  assert.equal(f.name, "Renamed By Hand");
  assert.equal(f.subtitle, "Indica");
  assert.deepEqual(f.rows.map((r) => r.value),
    ["7 g", "18%  /  2%", "1 Jan 2026", "2 Jan 2026", "Somewhere else", "XX-1"]);
});

test("flower time is gone, and batch took its place", () => {
  const f = labelFields(labelDraft(BLUE, null, "2026-09-08"));
  assert.ok(!f.rows.some((r) => /flower/i.test(r.label)), "a package does not print flower time");
  const g = labelFields({ batch: "BD-260908" });
  assert.equal(g.rows.find((r) => r.label === "Batch").value, "BD-260908");
});

test("terpenes keep their order and drop the nameless", () => {
  const t = cleanTerpenes([
    { name: "Myrcene", pct: "0.8%" },
    { name: "  ", pct: "9%" },
    { name: "Limonene" },
  ]);
  assert.deepEqual(t, [
    { name: "Myrcene", pct: "0.8%" },
    { name: "Limonene", pct: null },
  ]);
});

test("terpenes are capped at what the band can print", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `T${i}`, pct: "1%" }));
  assert.equal(cleanTerpenes(many).length, 6);
  assert.deepEqual(cleanTerpenes(null), []);
  assert.deepEqual(cleanTerpenes("nope"), []);
});

test("terpenes reach the printed spec", () => {
  const f = labelFields({ name: "X", terpenes: [{ name: "Myrcene", pct: "0.8%" }] });
  assert.equal(f.terpenes.length, 1);
  assert.equal(f.terpenes[0].name, "Myrcene");
});

test("an empty draft still prints something valid", () => {
  const f = labelFields({});
  assert.equal(f.name, "Unnamed");
  assert.deepEqual(f.rows, []);
  assert.deepEqual(f.terpenes, []);
  assert.equal(f.note, null);
  assert.deepEqual(labelFields().rows, []);
});
