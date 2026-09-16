import { test } from "node:test";
import assert from "node:assert/strict";
import { photoUrl } from "../src/lib/photoUrl.js";
import { photosForDay, listPlantPhotos } from "../worker/photos.js";

// A list of photographs is a list of IDS. Thumbnails used to travel inside it
// as base64, which is ~49 KB a picture: a journal day with twenty carried
// nearly a megabyte, and a plant's timeline carried one for every photograph it
// had ever had. These tests are the thing that keeps them out.

const THUMB = `data:image/jpeg;base64,${"A".repeat(50_000)}`;

function photoDb(rows) {
  const selects = [];
  return {
    selects,
    DB: {
      prepare(sql) {
        selects.push(sql);
        return {
          bind() { return this; },
          async first() { return /FROM grows/.test(sql) ? { id: "g1", survey: "{}" } : null; },
          async all() { return { results: rows }; },
          async run() { return {}; },
        };
      },
    },
  };
}

const ROWS = [
  { id: "ph1", date: "2026-09-01", thumb: THUMB, plant_id: "p1", from_camera: 1 },
  { id: "ph2", date: "2026-09-02", thumb: THUMB, plant_id: null, from_camera: 0 },
];

test("a day's photographs come back as ids, never as bytes", async () => {
  const env = photoDb(ROWS);
  const out = await photosForDay(env, 1, "g1", "2026-09-01");
  assert.equal(out.length, 2);
  for (const p of out) {
    assert.ok(p.id, "every photo needs its id, since the id is the picture");
    assert.equal(p.thumb, undefined, "a thumbnail must never ride along in the list");
  }
  assert.deepEqual(out[0], { id: "ph1", date: "2026-09-01", plantId: "p1", fromCamera: true });
  assert.equal(out[1].plantId, null);
  assert.equal(out[1].fromCamera, false);
});

test("the day query does not even read the expensive column", async () => {
  // Not selecting it is the difference between D1 reading 49 KB a row and
  // reading a handful of bytes.
  const env = photoDb(ROWS);
  await photosForDay(env, 1, "g1", "2026-09-01");
  const q = env.selects.find((s) => /FROM journal_photos/.test(s));
  assert.doesNotMatch(q, /\bthumb\b/, `still selecting thumb: ${q}`);
});

test("a plant's whole timeline is ids too, however long it is", async () => {
  // This was the worst one: unbounded, with a thumbnail on every row.
  const many = Array.from({ length: 300 }, (_, i) => ({
    id: `ph${i}`, date: "2026-09-01", thumb: THUMB, from_camera: 0,
  }));
  const env = photoDb(many);
  const res = await listPlantPhotos(env, { id: 1 }, "g1", "p1");
  const body = await res.json();
  assert.equal(body.photos.length, 300);
  for (const p of body.photos) assert.equal(p.thumb, undefined);

  // The whole timeline should now be a few kilobytes rather than megabytes.
  const bytes = JSON.stringify(body).length;
  assert.ok(bytes < 40_000, `300 photos should be small, got ${bytes} bytes`);
  const q = env.selects.find((s) => /FROM journal_photos/.test(s));
  assert.doesNotMatch(q, /\bthumb\b/);
});

test("the size a payload would have been, stated plainly", () => {
  // Kept as an assertion rather than a comment so the number cannot rot.
  const oneThumb = THUMB.length;
  assert.ok(oneThumb > 45_000);
  assert.ok(oneThumb * 20 > 900_000, "a twenty-photo day was very nearly a megabyte");
});

test("photoUrl names a picture, at either size, safely", () => {
  assert.equal(photoUrl("ph1"), "/api/photos/ph1/thumb");
  assert.equal(photoUrl("ph1", "full"), "/api/photos/ph1/full");
  // Anything that is not "full" is a thumbnail, never something else.
  assert.equal(photoUrl("ph1", "sneaky"), "/api/photos/ph1/thumb");
  assert.equal(photoUrl("ph1", undefined), "/api/photos/ph1/thumb");
});

test("an id is escaped rather than trusted into the path", () => {
  assert.equal(photoUrl("a/b"), "/api/photos/a%2Fb/thumb");
  assert.equal(photoUrl("a b?c=1"), "/api/photos/a%20b%3Fc%3D1/thumb");
});
