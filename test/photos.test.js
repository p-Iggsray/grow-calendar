import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePhotoInput } from "../worker/photos.js";

const TINY = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

test("accepts a valid jpeg upload", () => {
  const v = validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: TINY });
  assert.equal(v.ok, true);
});

test("rejects bad dates, including rolled-over impossibles by format", () => {
  assert.equal(validatePhotoInput({ date: "08/27/2026", data: TINY, thumb: TINY }).ok, false);
  assert.equal(validatePhotoInput({ data: TINY, thumb: TINY }).ok, false);
});

test("rejects non-image and non-data-URL payloads", () => {
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: "https://x/y.jpg", thumb: TINY }).ok, false);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: "data:text/html;base64,PGI+", thumb: TINY }).ok, false);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: "junk" }).ok, false);
});

test("rejects oversized images and thumbnails", () => {
  const big = "data:image/jpeg;base64," + "A".repeat(1_000_001);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: big, thumb: TINY }).ok, false);
  const bigThumb = "data:image/jpeg;base64," + "A".repeat(90_000);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: bigThumb }).ok, false);
});

test("plantId is optional but validated when present", () => {
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: TINY, plantId: "p_abc123" }).ok, true);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: TINY, plantId: null }).ok, true);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: TINY, plantId: "bad id!" }).ok, false);
  assert.equal(validatePhotoInput({ date: "2026-08-27", data: TINY, thumb: TINY, plantId: 42 }).ok, false);
});

test("garbage bodies reject instead of crashing", () => {
  assert.equal(validatePhotoInput(null).ok, false);
  assert.equal(validatePhotoInput("x").ok, false);
});
