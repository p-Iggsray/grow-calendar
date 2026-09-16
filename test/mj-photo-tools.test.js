import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../worker/mj/tools.js";
import { photosForRange, toInlineData, MJ_PHOTO_BATCH } from "../worker/photos.js";

const jpeg = (n = 400) => `data:image/jpeg;base64,${"A".repeat(n)}`;
const BLANK = "data:image/png;base64,iVBORw0KGgo=";

const SURVEY = { crop: "cannabis", strains: [{ id: "p1", name: "Blue Dream" }, { id: "p2", name: "Gelato" }] };
const TIMELINE = { events: [{ date: "2026-06-01", stage: "veg" }], firstDate: "2026-06-01" };

// Rows as the table holds them: newest first is what the query asks for.
function photoDb(rows) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...a) { this.a = a; return this; },
          async first() {
            if (/COUNT\(\*\)/.test(sql)) return { n: rows.length };
            if (/FROM journal_photos WHERE id = \?/.test(sql)) {
              return rows.find((r) => r.id === this.a[0]) ?? null;
            }
            return null;
          },
          async all() {
            const sorted = [...rows].sort((x, y) => (x.date < y.date ? 1 : -1));
            return { results: sorted };
          },
          async run() { return {}; },
        };
      },
    },
  };
}

const run = (name, input, env, shown) =>
  executeTool(name, input, env, 1, TIMELINE, [], "g1", { survey: SURVEY }, shown);

test("get_photos attaches the images and describes each one", async () => {
  const env = photoDb([
    { id: "a", date: "2026-07-01", thumb: jpeg(), plant_id: "p1" },
    { id: "b", date: "2026-07-08", thumb: jpeg(), plant_id: "p2" },
  ]);
  const shown = [];
  const out = await run("get_photos", {}, env, shown);
  assert.equal(out.total, 2);
  assert.equal(out.showing, 2);
  assert.equal(shown.length, 2, "both images must be handed to the model");
  assert.equal(shown[0].mimeType, "image/jpeg");
  // Oldest first, so "position 1" and the attachment order agree.
  assert.deepEqual(out.photos.map((p) => p.date), ["2026-07-01", "2026-07-08"]);
  assert.deepEqual(out.photos.map((p) => p.plant), ["Blue Dream", "Gelato"]);
  assert.deepEqual(out.photos.map((p) => p.growDay), [30, 37]);
});

test("it never hands over more than a batch, and says how many exist", async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    id: `p${i}`, date: `2026-07-${String(i + 1).padStart(2, "0")}`, thumb: jpeg(), plant_id: "p1",
  }));
  const shown = [];
  const out = await run("get_photos", {}, photoDb(rows), shown);
  assert.equal(out.total, 20);
  assert.equal(out.showing, MJ_PHOTO_BATCH);
  assert.equal(shown.length, MJ_PHOTO_BATCH);
  assert.match(out.note, /20 photographs match; showing 6/);
});

test("a day shot forty times does not crowd out the rest of the range", async () => {
  // Thirty from harvest day, one a week before it. A comparison has to include
  // the earlier one or it is not a comparison.
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, date: "2026-09-01", thumb: jpeg(), plant_id: "p1" })),
    { id: "old", date: "2026-08-25", thumb: jpeg(), plant_id: "p1" },
    { id: "older", date: "2026-08-18", thumb: jpeg(), plant_id: "p1" },
  ];
  const out = await run("get_photos", {}, photoDb(rows), []);
  const dates = new Set(out.photos.map((p) => p.date));
  assert.ok(dates.has("2026-08-25") && dates.has("2026-08-18"),
    `spread across days, got ${[...dates].join(",")}`);
});

test("an unviewable thumbnail is reported, not described", async () => {
  const shown = [];
  const out = await run("get_photos", {}, photoDb([
    { id: "a", date: "2026-07-01", thumb: BLANK, plant_id: "p1" },
  ]), shown);
  assert.equal(out.photos[0].viewable, false);
  assert.equal(shown.length, 0, "a blank placeholder is not worth a token");
  assert.match(out.note, /could not be attached/);
  assert.match(out.note, /say you cannot see them/);
});

test("with photos to show, the note tells her not to call trichomes off a thumbnail", async () => {
  const out = await run("get_photos", {}, photoDb([
    { id: "a", date: "2026-07-01", thumb: jpeg(), plant_id: "p1" },
  ]), []);
  assert.match(out.note, /480px/);
  assert.match(out.note, /get_photo/);
});

test("no photographs is an answer, not an error", async () => {
  const out = await run("get_photos", { from: "2020-01-01", to: "2020-02-01" }, photoDb([]), []);
  assert.deepEqual(out.photos, []);
  assert.equal(out.total, 0);
  assert.match(out.note, /No photographs/);
});

test("get_photo hands over one image at full size", async () => {
  const env = photoDb([{ id: "a", date: "2026-07-01", data: jpeg(9000), plant_id: "p1" }]);
  const shown = [];
  const out = await run("get_photo", { photo_id: "a" }, env, shown);
  assert.equal(out.id, "a");
  assert.equal(out.plant, "Blue Dream");
  assert.equal(out.viewable, true);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].data.length, 9000, "the full image, not the thumbnail");
  assert.match(out.note, /full resolution/);
});

test("get_photo refuses an id that is not this grow's", async () => {
  const out = await run("get_photo", { photo_id: "nope" }, photoDb([]), []);
  assert.match(out.error, /No photograph with id nope/);
});

test("get_photo without an id says where to get one", async () => {
  const out = await run("get_photo", {}, photoDb([]), []);
  assert.match(out.error, /get_photos/);
});

test("both photo tools refuse when there is no active grow", async () => {
  for (const name of ["get_photos", "get_photo"]) {
    const out = await executeTool(name, { photo_id: "a" }, photoDb([]), 1, TIMELINE, [], null, null, []);
    assert.match(out.error, /No active grow/);
  }
});

test("photosForRange honours a plant filter and a date window", async () => {
  const env = photoDb([{ id: "a", date: "2026-07-01", thumb: jpeg(), plant_id: "p1" }]);
  const out = await photosForRange(env, 1, "g1", { from: "2026-06-01", to: "2026-08-01", plantId: "p1", limit: 3 });
  assert.equal(out.total, 1);
  assert.equal(out.photos.length, 1);
});

test("toInlineData splits a stored data URL and rejects anything else", () => {
  assert.deepEqual(toInlineData(jpeg(300)), { mimeType: "image/jpeg", data: "A".repeat(300) });
  assert.equal(toInlineData(BLANK), null);
  assert.equal(toInlineData("http://example.com/x.jpg"), null);
  assert.equal(toInlineData(""), null);
  assert.equal(toInlineData(undefined), null);
});
