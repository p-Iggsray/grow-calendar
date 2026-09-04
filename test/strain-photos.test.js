import { test } from "node:test";
import assert from "node:assert/strict";
import { coverPhoto, photoUrl, pickStrainPhotos, spread, stageOn } from "../src/lib/strainPhotos.js";

const photo = (id, date, plantId = "p1") => ({ id, date, plantId, growId: "g1" });

// ── stageOn: which phase a photo was taken in ────────────────────────────────
const HISTORY = [
  { date: "2026-01-10", stage: "seedling" },
  { date: "2026-02-01", stage: "vegetative" },
  { date: "2026-04-01", stage: "flowering" },
];

test("a photo belongs to the last stage switched to on or before its day", () => {
  assert.equal(stageOn(HISTORY, "2026-01-10"), "seedling", "the day of the switch counts");
  assert.equal(stageOn(HISTORY, "2026-01-20"), "seedling");
  assert.equal(stageOn(HISTORY, "2026-02-01"), "vegetative");
  assert.equal(stageOn(HISTORY, "2026-03-31"), "vegetative");
  assert.equal(stageOn(HISTORY, "2026-09-09"), "flowering", "the last stage runs on forever");
});

test("before the first recorded switch the stage is simply unknown", () => {
  assert.equal(stageOn(HISTORY, "2026-01-01"), null);
});

test("a missing or empty history never guesses", () => {
  assert.equal(stageOn([], "2026-02-02"), null);
  assert.equal(stageOn(undefined, "2026-02-02"), null);
  assert.equal(stageOn(HISTORY, null), null);
});

// ── spread: a handful of photos across a whole grow ──────────────────────────
test("a spread keeps both ends, so it covers the whole run", () => {
  const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const got = spread(list, 4);
  assert.equal(got.length, 4);
  assert.equal(got[0], 1);
  assert.equal(got.at(-1), 10);
});

test("a spread of one takes the newest, which is the most grown", () => {
  assert.deepEqual(spread([1, 2, 3], 1), [3]);
});

test("asking for more than there are gives back everything, unchanged", () => {
  const list = [1, 2, 3];
  assert.deepEqual(spread(list, 9), [1, 2, 3]);
  assert.notEqual(spread(list, 9), list, "and a copy, not the original");
});

test("a spread of nothing, or of none, is empty rather than a crash", () => {
  assert.deepEqual(spread([], 5), []);
  assert.deepEqual(spread([1, 2, 3], 0), []);
  assert.deepEqual(spread([1, 2, 3], -1), []);
});

// ── pickStrainPhotos: one per phase, oldest first ────────────────────────────
test("one photo per stage, and the newest one in each", () => {
  const picked = pickStrainPhotos([
    photo("a", "2026-01-15"), photo("b", "2026-01-25"),   // both seedling
    photo("c", "2026-02-10"),                             // vegetative
    photo("d", "2026-04-20"), photo("e", "2026-05-01"),   // both flowering
  ], { p1: HISTORY });
  assert.deepEqual(picked.map((p) => p.id), ["b", "c", "e"]);
  assert.deepEqual(picked.map((p) => p.stage), ["seedling", "vegetative", "flowering"]);
});

test("the strip runs oldest to newest, so it reads as the plant growing", () => {
  const picked = pickStrainPhotos([
    photo("late", "2026-05-01"), photo("early", "2026-01-15"), photo("mid", "2026-02-10"),
  ], { p1: HISTORY });
  assert.deepEqual(picked.map((p) => p.id), ["early", "mid", "late"]);
});

test("photos of several plants of the same strain are read against their own histories", () => {
  const picked = pickStrainPhotos([
    { id: "a", date: "2026-02-10", plantId: "p1" },   // p1 is vegetative by then
    { id: "b", date: "2026-02-10", plantId: "p2" },   // p2 is still a seedling
  ], {
    p1: HISTORY,
    p2: [{ date: "2026-02-05", stage: "seedling" }],
  });
  assert.deepEqual(picked.map((p) => p.stage).sort(), ["seedling", "vegetative"]);
});

test("a strain whose stages were never logged still gets pictures", () => {
  // This is the common case: photos exist, stage switches were never recorded.
  const photos = Array.from({ length: 30 }, (_, i) =>
    photo(`p${i}`, `2026-03-${String(i + 1).padStart(2, "0")}`));
  const picked = pickStrainPhotos(photos, {}, 6);
  assert.equal(picked.length, 6);
  assert.equal(picked.every((p) => p.stage === null), true);
  assert.equal(picked[0].id, "p0", "spread across the whole run, not just the end");
  assert.equal(picked.at(-1).id, "p29");
});

test("known stages come first and unstaged photos only fill what is left", () => {
  const picked = pickStrainPhotos([
    photo("seed", "2026-01-15"),                       // seedling
    photo("veg", "2026-02-10"),                        // vegetative
    photo("early", "2026-01-01"), photo("older", "2025-12-01"),   // before any history
  ], { p1: HISTORY }, 3);
  const ids = picked.map((p) => p.id);
  assert.ok(ids.includes("seed") && ids.includes("veg"), "the staged ones are never dropped");
  assert.equal(picked.length, 3);
});

test("the cap is honoured even when every stage has a photo", () => {
  const many = [
    photo("a", "2026-01-15"), photo("b", "2026-02-10"), photo("c", "2026-04-20"),
  ];
  assert.equal(pickStrainPhotos(many, { p1: HISTORY }, 2).length, 2);
});

test("junk in never becomes a broken picture out", () => {
  assert.deepEqual(pickStrainPhotos(null, {}), []);
  assert.deepEqual(pickStrainPhotos([], {}), []);
  assert.deepEqual(pickStrainPhotos([{ id: "x" }, { date: "2026-01-01" }, null], {}), []);
});

// ── coverPhoto: the one that represents a strain in a list ───────────────────
test("the furthest-along stage is the face of the strain", () => {
  const cover = coverPhoto([
    { id: "seed", date: "2026-01-15", stage: "seedling" },
    { id: "flower", date: "2026-04-20", stage: "flowering" },
    { id: "veg", date: "2026-02-10", stage: "vegetative" },
  ]);
  assert.equal(cover.id, "flower");
});

test("harvest beats flower, because it is later in the run", () => {
  const cover = coverPhoto([
    { id: "flower", date: "2026-04-20", stage: "flowering" },
    { id: "harvest", date: "2026-06-01", stage: "harvest" },
  ]);
  assert.equal(cover.id, "harvest");
});

test("with no stages known at all, the most recent picture stands in", () => {
  const cover = coverPhoto([
    { id: "old", date: "2026-01-15", stage: null },
    { id: "new", date: "2026-05-15", stage: null },
  ]);
  assert.equal(cover.id, "new");
});

test("two photos of the same stage go to the newer one", () => {
  const cover = coverPhoto([
    { id: "early", date: "2026-04-01", stage: "flowering" },
    { id: "late", date: "2026-04-28", stage: "flowering" },
  ]);
  assert.equal(cover.id, "late");
});

test("a strain with no photos has no cover, rather than a broken one", () => {
  assert.equal(coverPhoto([]), null);
  assert.equal(coverPhoto(null), null);
  assert.equal(coverPhoto(undefined), null);
});

// ── photoUrl ─────────────────────────────────────────────────────────────────
test("a photo url names the size and escapes the id", () => {
  assert.equal(photoUrl("ph123"), "/api/photos/ph123/thumb");
  assert.equal(photoUrl("ph123", "full"), "/api/photos/ph123/full");
  assert.equal(photoUrl("ph123", "nonsense"), "/api/photos/ph123/thumb");
  assert.equal(photoUrl("a/b"), "/api/photos/a%2Fb/thumb");
});
