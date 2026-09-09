import { test } from "node:test";
import assert from "node:assert/strict";
import {
  photoKey, decodeDataUrl, putPhoto, putPhotoPair, getPhotoObject,
  deletePhotoObjects, photoUrl, hasPhotoStore,
} from "../worker/photoStore.js";
import { backfillPhotosToR2 } from "../worker/photos.js";

// A one pixel PNG, small enough to read in a diff and real enough to decode.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
  "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// A bucket that behaves like R2 for the handful of calls this code makes.
// `fail` names a key that refuses to be written, which is the case that decides
// whether a half-written photo can exist.
function fakeBucket({ fail } = {}) {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, opts) {
      if (fail && key === fail) throw new Error("bucket said no");
      objects.set(key, { bytes, contentType: opts?.httpMetadata?.contentType });
      return { key };
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.contentType } };
    },
    async delete(keys) {
      for (const k of [].concat(keys)) objects.delete(k);
    },
  };
}

test("a key names one size of one photo, scoped to its owner", () => {
  assert.equal(photoKey(7, "ph123", "full"), "u7/ph123.full");
  assert.equal(photoKey(7, "ph123", "thumb"), "u7/ph123.thumb");
  // Anything that is not "full" is the thumbnail, so a typo can never silently
  // overwrite the full-size picture with a 480px one.
  assert.equal(photoKey(7, "ph123", "nonsense"), "u7/ph123.thumb");
});

test("a URL is derived from the id and never from stored bytes", () => {
  assert.equal(photoUrl("ph123", "full"), "/api/photos/ph123/full");
  assert.equal(photoUrl("ph123", "thumb"), "/api/photos/ph123/thumb");
  assert.equal(photoUrl("ph123"), "/api/photos/ph123/thumb");
});

test("decoding keeps the content type and rejects anything that is not an image", () => {
  const ok = decodeDataUrl(PNG);
  assert.equal(ok.contentType, "image/png");
  assert.ok(ok.bytes.length > 0);

  assert.equal(decodeDataUrl("https://example.com/cat.png"), null);
  assert.equal(decodeDataUrl("data:text/html;base64,PHNjcmlwdD4="), null);
  assert.equal(decodeDataUrl(""), null);
  assert.equal(decodeDataUrl(null), null);
});

test("with no bucket bound, storing is a no-op rather than a failure", async () => {
  const env = {};
  assert.equal(hasPhotoStore(env), false);
  assert.equal(await putPhoto(env, 1, "ph1", "full", PNG), null);
  assert.equal(await putPhotoPair(env, 1, "ph1", { data: PNG, thumb: PNG }), null);
  assert.equal(await getPhotoObject(env, "u1/ph1.full"), null);
  // The caller reads null as "keep it in D1", so a deploy without a bucket
  // saves photos exactly as it used to instead of losing them.
  await deletePhotoObjects(env, ["u1/ph1.full"]);
});

test("a stored pair lands both sizes with their types", async () => {
  const env = { PHOTOS: fakeBucket() };
  const stored = await putPhotoPair(env, 4, "ph9", { data: PNG, thumb: PNG });
  assert.deepEqual(stored, { dataKey: "u4/ph9.full", thumbKey: "u4/ph9.thumb" });
  assert.equal(env.PHOTOS.objects.get("u4/ph9.full").contentType, "image/png");

  const object = await getPhotoObject(env, "u4/ph9.full");
  assert.ok(object.size > 0);
});

// The case that matters: a row pointing at a full image with no thumbnail
// renders as a broken tile forever and there is no cheap way to notice.
test("a pair that only half stores leaves nothing behind", async () => {
  const env = { PHOTOS: fakeBucket({ fail: "u4/ph9.thumb" }) };
  assert.equal(await putPhotoPair(env, 4, "ph9", { data: PNG, thumb: PNG }), null);
  assert.equal(env.PHOTOS.objects.size, 0);
});

test("an undecodable thumbnail also stores nothing", async () => {
  const env = { PHOTOS: fakeBucket() };
  assert.equal(await putPhotoPair(env, 4, "ph9", { data: PNG, thumb: "not a data url" }), null);
  assert.equal(env.PHOTOS.objects.size, 0);
});

test("a delete the bucket refuses never fails the request", async () => {
  const env = { PHOTOS: { async delete() { throw new Error("nope"); } } };
  // The row is already gone by this point. Throwing here would only mean the
  // grower sees their deleted photo again.
  await deletePhotoObjects(env, ["u1/ph1.full"]);
  await deletePhotoObjects(env, [null, undefined]);
});

// ── The backfill ────────────────────────────────────────────────────────────
//
// Enough of D1 to run the three statements the backfill uses. Rows are plain
// objects so the assertions can read them directly afterwards.
function fakeDb(rows) {
  return {
    prepare(sql) {
      return {
        // ensureJournalPhotosSchema runs its CREATE and ALTERs unbound.
        async run() { return { meta: { changes: 0 } }; },
        bind(...args) {
          return {
            async first() {
              if (sql.includes("COUNT(*)")) {
                return { n: rows.filter((r) => r.user_id === args[0] && r.data_key == null).length };
              }
              return null;
            },
            async all() {
              const limit = args[1];
              return {
                results: rows
                  .filter((r) => r.user_id === args[0] && r.data_key == null)
                  .slice(0, limit)
                  .map((r) => ({ id: r.id, data: r.data, thumb: r.thumb })),
              };
            },
            async run() {
              const [dataKey, thumbKey, id] = args;
              const row = rows.find((r) => r.id === id);
              Object.assign(row, { data: "", thumb: "", data_key: dataKey, thumb_key: thumbKey });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test("the backfill moves bytes out of the rows and leaves the record alone", async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: `ph${i}`, user_id: 1, date: "2026-09-01", data: PNG, thumb: PNG,
    data_key: null, thumb_key: null,
  }));
  const env = { DB: fakeDb(rows), PHOTOS: fakeBucket() };

  // One batch at a time, so a run of any length has a flat memory ceiling.
  const first = await (await backfillPhotosToR2(env, { id: 1 })).json();
  assert.equal(first.moved, 5);
  assert.equal(first.remaining, 2);
  assert.equal(first.done, false);

  const second = await (await backfillPhotosToR2(env, { id: 1 })).json();
  assert.equal(second.moved, 2);
  assert.equal(second.done, true);

  for (const r of rows) {
    assert.equal(r.data, "", "the base64 is gone from the row");
    assert.equal(r.data_key, `u1/${r.id}.full`);
    assert.equal(r.thumb_key, `u1/${r.id}.thumb`);
    assert.equal(r.date, "2026-09-01", "the record itself is untouched");
  }
  assert.equal(env.PHOTOS.objects.size, 14);
});

test("a re-run of a finished backfill does nothing", async () => {
  const rows = [{ id: "ph1", user_id: 1, data: "", thumb: "", data_key: "u1/ph1.full", thumb_key: "u1/ph1.thumb" }];
  const env = { DB: fakeDb(rows), PHOTOS: fakeBucket() };
  const r = await (await backfillPhotosToR2(env, { id: 1 })).json();
  assert.deepEqual(r, { moved: 0, failed: 0, remaining: 0, done: true });
});

// A row whose base64 will not decode must not stop the run, and must not make
// the driving loop spin on it forever either.
test("a row that cannot be read is counted, skipped, and reported as stuck", async () => {
  const rows = [{ id: "ph1", user_id: 1, data: "junk", thumb: "junk", data_key: null, thumb_key: null }];
  const env = { DB: fakeDb(rows), PHOTOS: fakeBucket() };
  const r = await (await backfillPhotosToR2(env, { id: 1 })).json();
  assert.equal(r.moved, 0);
  assert.equal(r.failed, 1);
  assert.equal(r.remaining, 1);
  assert.equal(r.stuck, true);
});

test("the backfill refuses to run without a bucket rather than reporting success", async () => {
  const res = await backfillPhotosToR2({ DB: fakeDb([]) }, { id: 1 });
  assert.equal(res.status, 503);
});
