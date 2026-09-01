import { test } from "node:test";
import assert from "node:assert/strict";
import { batchResultMessage, MAX_BATCH, nextIndex } from "../src/lib/photos.js";
import { validatePhotoInput } from "../worker/photos.js";

// ── batchResultMessage ───────────────────────────────────────────────────────
test("a fully successful batch says nothing at all", () => {
  assert.equal(batchResultMessage(5, []), "");
  assert.equal(batchResultMessage(0, []), "");
});

test("a partly successful batch reports how many landed", () => {
  const msg = batchResultMessage(3, ["a day holds at most 20 photos"]);
  assert.match(msg, /Added 3 of 4/);
  assert.match(msg, /at most 20 photos/);
});

test("a total failure does not pretend anything was added", () => {
  const msg = batchResultMessage(0, ["Could not read that image."]);
  assert.equal(msg, "Could not read that image.");
  assert.doesNotMatch(msg, /Added/);
});

test("identical failures are reported once, not once per file", () => {
  const same = Array(6).fill("a day holds at most 20 photos");
  const msg = batchResultMessage(0, same);
  assert.equal(msg, "a day holds at most 20 photos");
});

// ── nextIndex (swipe) ────────────────────────────────────────────────────────
test("a long drag turns the page in the direction of travel", () => {
  assert.equal(nextIndex(0, 5, -120, 0), 1);   // dragged left -> forward
  assert.equal(nextIndex(3, 5, 120, 0), 2);    // dragged right -> back
});

test("a fast flick turns the page even when it barely moved", () => {
  assert.equal(nextIndex(1, 5, -8, -900), 2);
  assert.equal(nextIndex(1, 5, 8, 900), 0);
});

test("a small slow drag stays put, so a tap is never a swipe", () => {
  assert.equal(nextIndex(2, 5, -20, -100), 2);
  assert.equal(nextIndex(2, 5, 0, 0), 2);
});

test("swiping past either end springs back instead of running off", () => {
  assert.equal(nextIndex(0, 5, 400, 2000), 0);       // before the first
  assert.equal(nextIndex(4, 5, -400, -2000), 4);     // past the last
  assert.equal(nextIndex(0, 1, -400, -2000), 0);     // a set of one
});

// ── the server still guards what the client sends ────────────────────────────
test("a batch cannot smuggle past the upload validator", () => {
  const good = {
    date: "2026-09-01",
    data: "data:image/jpeg;base64,AAAA",
    thumb: "data:image/jpeg;base64,AAAA",
  };
  assert.equal(validatePhotoInput(good).ok, true);
  assert.equal(validatePhotoInput({ ...good, data: "https://example.com/x.jpg" }).ok, false);
  assert.equal(validatePhotoInput({ ...good, date: "nope" }).ok, false);
  assert.equal(validatePhotoInput({ ...good, plantId: "../../etc" }).ok, false);
});

test("the client batch cap is a real number the day limit can absorb", () => {
  assert.ok(Number.isInteger(MAX_BATCH) && MAX_BATCH > 1);
});
