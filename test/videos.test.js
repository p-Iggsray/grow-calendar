import { test } from "node:test";
import assert from "node:assert/strict";
import {
  videoMimeOf, isVideoFile, formatDuration, durationFits, looksFreshFromCamera, mediaFilename,
  MAX_VIDEO_BYTES, MAX_VIDEO_MS, FRESH_CAPTURE_WINDOW_MS,
} from "../src/lib/videos.js";
import { addingLabel, progressFraction } from "../src/lib/addMedia.js";
import { contentRange, deleteMediaObjects } from "../worker/media.js";
import {
  validateVideoInput, isOwnUploadKey, videoKeyPrefix, checkVideoUploadHeaders,
  uploadVideoFile, createJournalVideo, getVideo,
} from "../worker/videos.js";
import { mediaListItem, pictureColumnSql } from "../worker/photos.js";
import { mediaCountLabel, getGrowReport } from "../worker/report.js";

const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const NOW = Date.parse("2026-09-25T12:00:00Z");

// ── What counts as a video ───────────────────────────────────────────────────

test("a video's type comes from the file, or from its name when the picker sent none", () => {
  assert.equal(videoMimeOf({ type: "video/mp4" }), "video/mp4");
  assert.equal(videoMimeOf({ type: "video/quicktime", name: "IMG_1.MOV" }), "video/quicktime");
  assert.equal(videoMimeOf({ type: "", name: "clip.MOV" }), "video/quicktime");
  assert.equal(videoMimeOf({ type: "application/octet-stream", name: "clip.m4v" }), "video/mp4");
  assert.equal(videoMimeOf({ type: "video/mp4; codecs=avc1" }), "video/mp4");
});

test("a video the app cannot store is still recognised as a video, so it gets a video's error", () => {
  assert.equal(videoMimeOf({ type: "video/3gpp", name: "a.3gp" }), null);
  assert.equal(isVideoFile({ type: "video/3gpp", name: "a.3gp" }), true);
});

test("photos and anything else are not videos", () => {
  assert.equal(isVideoFile({ type: "image/jpeg", name: "image.jpg" }), false);
  assert.equal(videoMimeOf({ type: "image/jpeg", name: "sneaky.mov" }), null);
  assert.equal(videoMimeOf(null), null);
});

test("durations read the way a clock does", () => {
  assert.equal(formatDuration(42_000), "0:42");
  assert.equal(formatDuration(60_000), "1:00");
  assert.equal(formatDuration(4_400), "0:04");
  assert.equal(formatDuration(null), "0:00");
});

test("a minute fits, a camera's slightly-over minute fits, a minute and a half does not", () => {
  assert.equal(durationFits(MAX_VIDEO_MS), true);
  assert.equal(durationFits(60_030), true);
  assert.equal(durationFits(90_000), false);
  assert.equal(durationFits(0), false);
  assert.equal(durationFits("abc"), false);
});

test("a saved copy is named for its day and container", () => {
  assert.equal(mediaFilename("2026-09-25", "video/quicktime"), "grow-2026-09-25.mov");
  assert.equal(mediaFilename("2026-09-25", null), "grow-2026-09-25.jpg");
});

// ── Was it just taken? ───────────────────────────────────────────────────────

test("a single capture stamped just now counts as fresh from the camera", () => {
  assert.equal(looksFreshFromCamera({ name: "image.jpg", lastModified: NOW - 2000 }, 1, NOW), true);
  assert.equal(looksFreshFromCamera({ name: "capturedvideo.MOV", lastModified: NOW }, 1, NOW), true);
});

test("a batch is always a library pick", () => {
  assert.equal(looksFreshFromCamera({ name: "image.jpg", lastModified: NOW }, 3, NOW), false);
});

test("an old file is a library pick", () => {
  const old = NOW - FRESH_CAPTURE_WINDOW_MS - 1;
  assert.equal(looksFreshFromCamera({ name: "20260101_120000.jpg", lastModified: old }, 1, NOW), false);
});

test("iOS stamps library picks with the time of the pick, so the name decides", () => {
  assert.equal(looksFreshFromCamera({ name: "IMG_4821.jpeg", lastModified: NOW }, 1, NOW), false);
  assert.equal(looksFreshFromCamera({ name: "IMG_4822.MOV", lastModified: NOW }, 1, NOW), false);
  assert.equal(looksFreshFromCamera({ name: "PXL_20260925_120000.mp4", lastModified: NOW }, 1, NOW), false);
});

test("no timestamp means no claim", () => {
  assert.equal(looksFreshFromCamera({ name: "image.jpg" }, 1, NOW), false);
  assert.equal(looksFreshFromCamera(null, 1, NOW), false);
});

// ── Progress on the add button ───────────────────────────────────────────────

test("the add button counts through a batch and shows a video's upload", () => {
  assert.equal(addingLabel(null), null);
  assert.equal(addingLabel({ done: 0, total: 1, fraction: null, video: false }), "Adding…");
  assert.equal(addingLabel({ done: 0, total: 1, fraction: 0.456, video: true }), "Uploading 46%");
  assert.equal(addingLabel({ done: 1, total: 3, fraction: null, video: false }), "Adding 2 of 3…");
  assert.equal(addingLabel({ done: 1, total: 3, fraction: 0.5, video: true }), "Adding 2 of 3, 50%");
  assert.equal(addingLabel({ done: 1, total: 3, fraction: 0.5, video: true }, { compact: true }), "2/3 50%");
  // The final report after the last item never reads "4 of 3".
  assert.equal(addingLabel({ done: 3, total: 3, fraction: null, video: false }), "Adding 3 of 3…");
});

test("the progress bar counts the video part-way through", () => {
  assert.equal(progressFraction({ done: 1, total: 2, fraction: 0.5 }), 0.75);
  assert.equal(progressFraction({ done: 2, total: 2, fraction: null }), 1);
  assert.equal(progressFraction(null), 0);
});

// ── Ranges ───────────────────────────────────────────────────────────────────

test("a range R2 read becomes a Content-Range", () => {
  assert.deepEqual(contentRange({ offset: 0, length: 100 }, 1000), { offset: 0, length: 100, header: "bytes 0-99/1000" });
  assert.deepEqual(contentRange({ offset: 900 }, 1000), { offset: 900, length: 100, header: "bytes 900-999/1000" });
  assert.deepEqual(contentRange({ suffix: 10 }, 1000), { offset: 990, length: 10, header: "bytes 990-999/1000" });
});

test("a range that cannot be satisfied is refused rather than invented", () => {
  assert.equal(contentRange({ offset: 1000 }, 1000), null);
  assert.equal(contentRange(undefined, 1000), null);
  assert.equal(contentRange({ offset: 0, length: 10 }, 0), null);
});

// ── The row ──────────────────────────────────────────────────────────────────

const KEY = `${videoKeyPrefix(7, "g1")}0123abcd-0123-4567-89ab-0123456789ab`;
const good = (over = {}) => ({ date: "2026-09-25", uploadKey: KEY, thumb: THUMB, durationMs: 42_000, ...over });

test("a well formed video row passes", () => {
  assert.equal(validateVideoInput(good()).ok, true);
  assert.equal(validateVideoInput(good({ plantId: "p_1", fromCamera: true })).ok, true);
});

test("a video row without a poster, a length or a date is refused", () => {
  assert.equal(validateVideoInput(good({ thumb: "junk" })).ok, false);
  assert.equal(validateVideoInput(good({ durationMs: 120_000 })).ok, false);
  assert.equal(validateVideoInput(good({ durationMs: undefined })).ok, false);
  assert.equal(validateVideoInput(good({ date: "09/25/2026" })).ok, false);
  assert.equal(validateVideoInput(good({ uploadKey: "" })).ok, false);
  assert.equal(validateVideoInput(good({ fromCamera: "yes" })).ok, false);
  assert.equal(validateVideoInput(null).ok, false);
});

test("an upload key only counts for the user and grow it was made under", () => {
  assert.equal(isOwnUploadKey(KEY, 7, "g1"), true);
  assert.equal(isOwnUploadKey(KEY, 8, "g1"), false);
  assert.equal(isOwnUploadKey(KEY, 7, "g2"), false);
  assert.equal(isOwnUploadKey(`${videoKeyPrefix(7, "g1")}../../videos/8/g1/x`, 7, "g1"), false);
  assert.equal(isOwnUploadKey(null, 7, "g1"), false);
});

test("the upload's headers decide what it is and whether it fits", () => {
  assert.deepEqual(checkVideoUploadHeaders("video/quicktime", "5000"), { ok: true, mime: "video/quicktime", bytes: 5000 });
  assert.equal(checkVideoUploadHeaders("image/jpeg", "5000").status, 415);
  assert.equal(checkVideoUploadHeaders("video/mp4", null).status, 411);
  assert.equal(checkVideoUploadHeaders("video/mp4", String(MAX_VIDEO_BYTES + 1)).status, 413);
});

test("a photo lists exactly as it always has; a video carries its length", () => {
  assert.deepEqual(
    mediaListItem({ id: "ph1", date: "2026-09-25", plant_id: null, from_camera: 0, kind: "photo" }),
    { id: "ph1", date: "2026-09-25", plantId: null, fromCamera: false },
  );
  assert.deepEqual(
    mediaListItem({ id: "ph2", date: "2026-09-25", plant_id: "p1", from_camera: 1, kind: "video", duration_ms: 4200, mime: "video/mp4" }),
    { id: "ph2", date: "2026-09-25", plantId: "p1", fromCamera: true, kind: "video", durationMs: 4200, mime: "video/mp4" },
  );
});

test("a video's full-size picture is its poster, since that is the only still it has", () => {
  assert.equal(pictureColumnSql("thumb"), "thumb");
  assert.match(pictureColumnSql("full"), /WHEN kind = 'video' THEN thumb ELSE data/);
});

test("the rundown counts photographs and videos apart", () => {
  assert.equal(mediaCountLabel(24, 3), "24 photographs, 3 videos");
  assert.equal(mediaCountLabel(1, 0), "1 photograph");
  assert.equal(mediaCountLabel(0, 1), "1 video");
});

// ── The handlers, against a fake D1 and R2 ──────────────────────────────────

function fakeEnv({ dayCount = 0, videoCount = 0, headSize = 5000, existing = null, videoRow = null, bucket = true } = {}) {
  const puts = [];
  const deletes = [];
  const inserts = [];
  const env = {
    puts, deletes, inserts,
    DB: {
      prepare(sql) {
        return {
          bind(...a) { this.a = a; return this; },
          async first() {
            if (/FROM grows/.test(sql)) return { id: "g1", survey: JSON.stringify({ strains: [{ id: "p1" }] }) };
            if (/COUNT\(\*\).*date = \?/.test(sql)) return { n: dayCount };
            if (/COUNT\(\*\).*kind = \?/.test(sql)) return { n: videoCount };
            if (/WHERE r2_key = \?/.test(sql)) return existing;
            if (/SELECT r2_key, mime/.test(sql)) return videoRow;
            return null;
          },
          async all() { return { results: [] }; },
          async run() { if (/INSERT/.test(sql)) inserts.push(this.a); return { meta: { changes: 1 } }; },
        };
      },
    },
  };
  if (bucket) {
    env.MEDIA = {
      async put(key, body, opts) { puts.push({ key, opts }); },
      async head() { return headSize == null ? null : { size: headSize, httpMetadata: { contentType: "video/quicktime" } }; },
      async delete(keys) { deletes.push(...keys); },
      async get(key, opts) {
        const size = 1000;
        const range = opts?.range ? { offset: 0, length: 100 } : undefined;
        return {
          size, range, httpEtag: '"e"', body: "bytes",
          writeHttpMetadata(h) { h.set("content-type", "video/quicktime"); },
        };
      },
    };
  }
  return env;
}

const user = { id: 7 };
const uploadRequest = (headers, date = "2026-09-25") =>
  new Request(`https://x/api/grows/g1/videos/upload?date=${date}`, {
    method: "PUT", headers, body: "x".repeat(10),
  });

test("an upload streams straight into this user's part of the bucket", async () => {
  const env = fakeEnv();
  const res = await uploadVideoFile(uploadRequest({ "content-type": "video/mp4", "content-length": "10" }), env, user, "g1");
  assert.equal(res.status, 200);
  const { uploadKey } = await res.json();
  assert.ok(isOwnUploadKey(uploadKey, 7, "g1"));
  assert.equal(env.puts[0].opts.httpMetadata.contentType, "video/mp4");
});

test("a full day turns the upload away before a byte is stored", async () => {
  const env = fakeEnv({ dayCount: 20 });
  const res = await uploadVideoFile(uploadRequest({ "content-type": "video/mp4", "content-length": "10" }), env, user, "g1");
  assert.equal(res.status, 400);
  assert.equal(env.puts.length, 0);
});

test("a grow at its video ceiling turns the upload away", async () => {
  const env = fakeEnv({ videoCount: 100 });
  const res = await uploadVideoFile(uploadRequest({ "content-type": "video/mp4", "content-length": "10" }), env, user, "g1");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /100 videos/);
});

test("without the bucket bound, uploading says so instead of crashing", async () => {
  const env = fakeEnv({ bucket: false });
  const res = await uploadVideoFile(uploadRequest({ "content-type": "video/mp4", "content-length": "10" }), env, user, "g1");
  assert.equal(res.status, 503);
});

const commitRequest = (body) => new Request("https://x/api/grows/g1/videos", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

test("committing records the size the bucket reports, not what the client claims", async () => {
  const env = fakeEnv({ headSize: 4321 });
  const res = await createJournalVideo(commitRequest(good({ plantId: "p1" })), env, user, "g1");
  assert.equal(res.status, 200);
  const { photo } = await res.json();
  assert.equal(photo.kind, "video");
  assert.equal(photo.plantId, "p1");
  const row = env.inserts[0];
  assert.ok(row.includes(4321), "size_bytes is the bucket's");
  assert.ok(row.includes("video/quicktime"), "mime is the bucket's");
});

test("committing an upload that never arrived is refused", async () => {
  const res = await createJournalVideo(commitRequest(good()), fakeEnv({ headSize: null }), user, "g1");
  assert.equal(res.status, 400);
});

test("committing someone else's upload key is refused", async () => {
  const other = `${videoKeyPrefix(8, "g1")}0123abcd-0123-4567-89ab-0123456789ab`;
  const res = await createJournalVideo(commitRequest(good({ uploadKey: other })), fakeEnv(), user, "g1");
  assert.equal(res.status, 400);
});

test("committing the same upload twice is refused", async () => {
  const res = await createJournalVideo(commitRequest(good()), fakeEnv({ existing: { id: "ph1" } }), user, "g1");
  assert.equal(res.status, 409);
});

test("a day that filled up while the file was uploading gives the file back", async () => {
  const env = fakeEnv({ dayCount: 20 });
  const res = await createJournalVideo(commitRequest(good()), env, user, "g1");
  assert.equal(res.status, 400);
  assert.deepEqual(env.deletes, [KEY]);
});

test("a range request is answered with 206 and the part asked for", async () => {
  const env = fakeEnv({ videoRow: { r2_key: KEY, mime: "video/quicktime" } });
  const req = new Request("https://x/api/videos/ph1", { headers: { range: "bytes=0-99" } });
  const res = await getVideo(req, env, user, "ph1");
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-range"), "bytes 0-99/1000");
  assert.equal(res.headers.get("accept-ranges"), "bytes");
  assert.match(res.headers.get("cache-control"), /private/);
});

test("a video that is not the user's is not found", async () => {
  const res = await getVideo(new Request("https://x/api/videos/ph1"), fakeEnv({ videoRow: null }), user, "ph1");
  assert.equal(res.status, 404);
});

test("removing files batches under R2's per-call limit and survives a failure", async () => {
  const calls = [];
  const env = { MEDIA: { get() {}, async delete(keys) { calls.push(keys.length); throw new Error("down"); } } };
  await deleteMediaObjects(env, Array.from({ length: 1500 }, (_, i) => `k${i}`));
  assert.deepEqual(calls, [1000, 500]);
});

// ── The rundown ──────────────────────────────────────────────────────────────

test("the rundown prints a video as its poster, marked with a play symbol and its length", async () => {
  const media = [
    { id: "ph1", date: "2026-09-20", plant_id: null, thumb: THUMB, kind: "photo", duration_ms: null },
    { id: "ph2", date: "2026-09-20", plant_id: null, thumb: THUMB, kind: "video", duration_ms: 42_000 },
  ];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return /FROM grows/.test(sql)
              ? { id: "g1", user_id: 7, display_name: "Tent", survey: JSON.stringify({ crop: "cannabis", strains: [] }) }
              : null;
          },
          async all() { return { results: /FROM journal_photos/.test(sql) ? media : [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
      },
    },
  };
  const res = await getGrowReport(env, { id: 7 }, "g1");
  const html = await res.text();
  assert.match(html, /Plates · 1 photograph, 1 video/);
  assert.match(html, /<svg class="play"/);
  assert.match(html, /Video 0:42/);
  // The poster itself is what is printed; no video element could print.
  assert.doesNotMatch(html, /<video/);
});
