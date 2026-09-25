// Journal videos: the rules both ends agree on, with no browser or worker in
// them so the tests can hold both sides to the same numbers.
//
// A video is not squeezed into D1 the way a photo is. The file goes to R2 as it
// came off the phone, and its row in journal_photos carries a poster frame in
// `thumb` so every grid, share page and rundown that already knows how to show
// a thumbnail shows the video's too.

// Workers refuse a request body over 100 MB on the free and Pro plans, and the
// file travels in one request, so this is the real ceiling rather than a
// preference. Decimal on purpose: it sits under the limit whichever way
// Cloudflare counts a megabyte.
export const MAX_VIDEO_BYTES = 100_000_000;

// A minute of 1080p phone footage lands around 60 to 100 MB, which is what
// makes a minute the length that fits the byte ceiling.
export const MAX_VIDEO_MS = 60_000;
// Phones stamp a "60 second" clip as 60.03s. A second of slack keeps a clip
// that the camera app itself cut at a minute from being turned away.
export const VIDEO_DURATION_SLACK_MS = 1_000;

// Photos keep their own 800. Videos are capped separately because each one is
// a hundred photos' worth of storage.
export const MAX_VIDEOS_PER_GROW = 100;

// What R2 will be asked to store, and the extension a saved copy gets.
export const VIDEO_TYPES = Object.freeze({
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
});

// Some pickers hand over a file with no type at all. The name is the only
// other clue, and these are the containers phones actually record.
const EXTENSION_TYPES = Object.freeze({
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
});

/** Pure: the storable video type of a file-like `{ type, name }`, or null. */
export function videoMimeOf(file) {
  const type = String(file?.type ?? "").toLowerCase().split(";")[0].trim();
  if (VIDEO_TYPES[type]) return type;
  if (type && !type.startsWith("video/") && type !== "application/octet-stream") return null;
  const ext = /\.([a-z0-9]+)$/i.exec(String(file?.name ?? ""))?.[1]?.toLowerCase();
  return (ext && EXTENSION_TYPES[ext]) || null;
}

/** Pure: does this picked file look like a video at all, storable or not? */
export function isVideoFile(file) {
  const type = String(file?.type ?? "").toLowerCase();
  return type.startsWith("video/") || videoMimeOf(file) !== null;
}

/** Pure: "0:42", "1:00". Rounded to the second, never negative. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Pure: is a clip of this length inside the cap? */
export function durationFits(ms) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 && n <= MAX_VIDEO_MS + VIDEO_DURATION_SLACK_MS;
}

// ── Was this shot just taken? ────────────────────────────────────────────────
//
// There is one add button now, and the OS sheet behind it offers the camera
// and the library side by side. The page is not told which was used, but a
// shot taken through the app is not in the camera roll, and the app needs to
// know that to offer the save sheet.
//
// Three clues, all of which have to agree:
//   * one file. The camera hands back exactly one; a library pick of one photo
//     also does, which is why this is not enough alone.
//   * stamped within the last moments. A camera capture is written as it is
//     handed over; Android library picks keep the day they were shot.
//   * not named like a library item. iOS stamps library picks with the time of
//     the pick, so the timestamp alone would call every one of them fresh, but
//     it names them after the original (IMG_1234.jpeg) while a capture arrives
//     as "image.jpg" or similar.

// How recent "just taken" is. Long enough for a slow phone to hand the file
// over, short enough that a photo from this morning never qualifies.
export const FRESH_CAPTURE_WINDOW_MS = 30_000;
const LIBRARY_NAME_RE = /^(IMG|VID|PXL|MVIMG|DSC|DCIM)[_-]?\d/i;

/** Pure: does this pick look like a shot taken just now through the app? */
export function looksFreshFromCamera(file, pickedCount, now = Date.now()) {
  if (pickedCount !== 1 || !file) return false;
  const modified = Number(file.lastModified);
  if (!Number.isFinite(modified)) return false;
  const age = now - modified;
  if (age < -FRESH_CAPTURE_WINDOW_MS || age > FRESH_CAPTURE_WINDOW_MS) return false;
  return !LIBRARY_NAME_RE.test(String(file.name ?? ""));
}

/** Pure: the filename a saved copy of this media gets. */
export function mediaFilename(date, mime) {
  const ext = VIDEO_TYPES[mime] ?? "jpg";
  return `grow-${date || "photo"}.${ext}`;
}
