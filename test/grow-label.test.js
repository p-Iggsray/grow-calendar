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
  assert.equal(d.classification, "Hybrid", "the variety, and not the crop or the photoperiod");
  assert.equal(d.harvested, "6 Sep 2026");
  assert.equal(d.packaged, "8 Sep 2026");
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
    batch: "XX-1",
  });
  assert.equal(f.name, "Renamed By Hand");
  assert.equal(f.variety, "Indica");
  assert.deepEqual(f.rows.map((r) => r.value),
    ["7 g", "18%  /  2%", "1 Jan 2026", "2 Jan 2026", "XX-1"]);
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
  assert.deepEqual(labelFields().rows, []);
});

test("the label carries names and numbers, and no prose", () => {
  // The grower asked for a label with no descriptions on it. A strain's note
  // is the one field that could put a sentence back on the stock, so nothing
  // the fold returns may carry one.
  const f = labelFields({
    ...labelDraft({ name: "Blue Dream", note: "Sweet berry nose, heavy yield." }, null, "2026-09-09"),
    netWeight: "3.5 g",
  });
  assert.equal(f.note, undefined);
  assert.ok(!JSON.stringify(f).includes("Sweet berry"));
  assert.deepEqual(f.rows.map((r) => r.label), ["Net weight", "Packaged"]);
});

test("no more terpenes are kept than a single line could ever hold", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `Terp${i}`, pct: "0.1%" }));
  assert.equal(labelFields({ name: "X", terpenes: many }).terpenes.length, 6);
});

test("the label prints the four things the jar is for, and not the grow's business", () => {
  const f = labelFields({
    name: "Blue Dream", classification: "Hybrid",
    thc: "24.8%", cbd: "0.3%", harvested: "1 Aug 2026", packaged: "9 Sep 2026",
  });
  assert.deepEqual(f.rows.map((r) => r.label), ["THC / CBD", "Harvested", "Packaged"]);
  assert.equal(f.variety, "Hybrid");
  // Where it grew is the grower's record, not the buyer's, and it is off.
  assert.ok(!f.rows.some((r) => /grown/i.test(r.label)));
});

test("the variety is the whole classification, without the crop or the photoperiod", () => {
  const cannabis = labelDraft({ name: "X", type: "indica", crop: "cannabis", photo: true }, null, "2026-09-09");
  assert.equal(cannabis.classification, "Indica");
  const shrooms = labelDraft({ name: "Y", type: "cube", crop: "mushrooms" }, null, "2026-09-09");
  assert.equal(shrooms.classification, "Cubensis");
});

test("a bare potency number is printed as a percentage", () => {
  // Potency is only ever a percentage, so the sign is not worth typing.
  assert.deepEqual(labelFields({ name: "X", thc: "24.8" }).rows, [{ label: "THC", value: "24.8%" }]);
  assert.deepEqual(labelFields({ name: "X", thc: "21", cbd: "0.3" }).rows,
    [{ label: "THC / CBD", value: "21%  /  0.3%" }]);
});

test("a potency that is not a bare number is left exactly as written", () => {
  // "< 0.1%" and "ND" are things a grower means on purpose, and a second sign
  // would not improve any of them.
  for (const typed of ["24.8%", "< 0.1%", "ND", "24.8 %"]) {
    assert.equal(labelFields({ name: "X", thc: typed }).rows[0].value, typed);
  }
});
