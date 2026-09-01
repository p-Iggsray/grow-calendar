// Photo helpers with no React in them: shrinking a file down to something
// storable, describing how a batch went, and deciding where a swipe lands.
// Kept out of the components so they can be unit-tested directly.
//
// ── Shrinking a phone photo ──────────────────────────────────────────────────
//
// Photos live in D1 as base64 data URLs, so there is a hard byte budget per
// picture and the whole job is spending it well. How many pixels a budget buys
// depends entirely on the picture: dense foliage - exactly what this app
// photographs - is the worst case for any codec. So instead of a fixed size we
// encode, measure the real bytes, and converge on the largest image that fits.
//
// Four things matter for how sharp the result looks, and all four are handled
// below: the codec (WebP beats JPEG by roughly a third at equal quality), the
// resampling quality (browsers default to a fast, soft downscale), doing large
// reductions in halving steps rather than one jump, and actually spending the
// budget instead of stopping short of it.

// The server accepts 980k chars of data and 80k of thumb, but one D1 row holds
// the photo, its thumbnail AND its metadata, so what matters is the total. A
// real 12MP photo comes in around 690k, comfortably inside this, which means
// the margin below costs nothing in practice and only ever bites a picture that
// barely compresses at all. Not worth crowding a row limit to win pixels on a
// case that does not happen.
const MAX_DATA_CHARS = 820_000;
const MAX_THUMB_CHARS = 50_000;
// base64 costs 4 characters per 3 bytes, so a char budget is a byte budget.
const b64Bytes = (chars) => Math.floor((chars * 3) / 4) - 64; // -64 for the data: prefix

const MAX_DATA_BYTES = b64Bytes(MAX_DATA_CHARS);
const MAX_THUMB_BYTES = b64Bytes(MAX_THUMB_CHARS);

// What a photo is sized FOR: the screen it will be looked at on. The viewer
// shows it full-bleed, so a long edge matching the phone's own pixel count is
// pin sharp, and anything beyond that is bytes spent on detail no screen will
// ever draw. The floor keeps a small-screen phone from storing something too
// coarse to be worth keeping; the cap stops a desktop from asking for more than
// a phone camera gives.
const SCREEN_MIN_EDGE = 1600;
const SCREEN_MAX_EDGE = 3200;
const FALLBACK_EDGE = 2400;       // no window to measure (tests, workers)
const MIN_EDGE = 480;             // a size that always fits, whatever the photo
const THUMB_EDGE = 480;           // 3-up grid on a 3x screen, and the viewer's placeholder

// Quality to aim for. WebP at 0.85 is visually indistinguishable from maximum
// on a photo, at a fraction of the bytes; the rest is the ladder down for a
// picture whose detail refuses to compress.
const QUALITY_LADDER = [0.85, 0.78, 0.7, 0.62, 0.54];
const MAX_ROUNDS = 6;
// Walking the ladder from 0.85 down to 0.54 only buys back about 1.9x in bytes.
// If the first encode is further over the budget than that, softening cannot
// rescue this size, and encoding four more full-size copies just to prove it is
// what made a grainy photo take seven seconds. Shrink instead.
const LADDER_RESCUE = 2.2;
// ...and when we skip the ladder, aim the shrink at a budget inflated by the
// softening still in hand, or the next size lands far smaller than it needed to.
const LADDER_RESERVE = 1.8;

/**
 * Pure: the long edge to store, for a screen of this size.
 *
 * CSS pixels times the device ratio is the real pixel count of the display, so
 * a photo at that long edge fills it exactly.
 */
export function screenTargetEdge(cssWidth, cssHeight, dpr) {
  const longEdge = Math.max(Number(cssWidth) || 0, Number(cssHeight) || 0);
  const ratio = Number(dpr) > 0 ? Number(dpr) : 1;
  const px = Math.round(longEdge * ratio);
  if (!px) return FALLBACK_EDGE;
  return Math.min(SCREEN_MAX_EDGE, Math.max(SCREEN_MIN_EDGE, px));
}

function displayTargetEdge() {
  if (typeof window === "undefined" || !window.screen) return FALLBACK_EDGE;
  return screenTargetEdge(window.screen.width, window.screen.height, window.devicePixelRatio);
}

// How many files one pick may add at once. Guards against an accidental
// "select all" on a 3000-photo camera roll, and matches the server's per-day
// ceiling so a full batch can always land.
export const MAX_BATCH = 20;

/**
 * Pure: given an encode of `bytes` at `edge`, the edge that should land on
 * `budget`. Bytes scale with pixel count and pixel count with the square of the
 * edge, so the square root of the ratio is the estimate; 0.92 undershoots
 * deliberately, because one encode inside the budget beats two that bracket it.
 * Clamped so it always makes progress and never collapses to nothing.
 */
export function nextEdgeGuess(edge, bytes, budget) {
  if (!(bytes > 0) || !(budget > 0)) return Math.max(MIN_EDGE, Math.round(edge * 0.75));
  const scale = Math.sqrt(budget / bytes) * 0.92;
  const next = Math.round(edge * Math.min(0.96, scale));   // always shrink
  return Math.max(MIN_EDGE, next);
}

// Which codec this browser can actually encode. Safari gained WebP encoding in
// iOS 14; anything older silently hands back a PNG, which would blow the budget
// instantly, so we check the bytes we got rather than trusting the request.
let _formatPromise = null;
function bestFormat() {
  _formatPromise ??= (async () => {
    try {
      const probe = makeCanvas(2, 2);
      probe.getContext("2d").fillRect(0, 0, 2, 2);
      const blob = await canvasToBlob(probe, "image/webp", 0.8);
      if (blob?.type === "image/webp") return "image/webp";
    } catch { /* fall through to jpeg */ }
    return "image/jpeg";
  })();
  return _formatPromise;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function canvasToBlob(canvas, type, quality) {
  try {
    if (typeof canvas.convertToBlob === "function") {
      return canvas.convertToBlob({ type, quality }).catch(() => null);
    }
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  } catch {
    return Promise.resolve(null);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(blob);
  });
}

// Draw the bitmap at a target edge. Browsers default to a fast, low-quality
// resample, and a single big reduction is softer still, so: ask for the good
// filter, and get there by halving until the last step is a gentle one.
function drawAt(bitmap, maxEdge) {
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.max(1, Math.round(bitmap.width * ratio));
  const targetH = Math.max(1, Math.round(bitmap.height * ratio));

  let srcW = bitmap.width;
  let srcH = bitmap.height;
  let src = bitmap;
  let canvas = null;

  // Halve until one more halving would overshoot the target.
  while (srcW / 2 > targetW && srcH / 2 > targetH) {
    const w = Math.max(targetW, Math.round(srcW / 2));
    const h = Math.max(targetH, Math.round(srcH / 2));
    const step = makeCanvas(w, h);
    const ctx = step.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    src = step;
    srcW = w;
    srcH = h;
    canvas = step;
  }

  if (srcW === targetW && srcH === targetH && canvas) return canvas;

  const out = makeCanvas(targetW, targetH);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, targetW, targetH);
  return out;
}

// One encode, tolerant of a canvas that will not produce bytes. A phone that is
// short on memory, or a Safari that will not encode WebP at this size, returns
// null rather than throwing - and a null used to abort the whole upload with
// "could not be compressed enough", which was never true.
async function encodeOnce(bitmap, type, edge, quality, state) {
  const blob = await canvasToBlob(drawAt(bitmap, edge), type, quality);
  if (blob) return blob;
  // Once WebP has failed at a real size, stop asking for it.
  if (state && type === "image/webp" && !state.jpegOnly) {
    state.jpegOnly = true;
    return canvasToBlob(drawAt(bitmap, edge), "image/jpeg", quality);
  }
  return null;
}

/**
 * Encode the largest, best-looking version that fits `budgetBytes`.
 *
 * Start at the size the screen can actually show, then give up QUALITY before
 * SIZE: a slightly softer photo at full screen resolution beats a crisp one too
 * small to fill the display. Only when the whole ladder has failed does the
 * picture shrink, and then by however much the measured bytes say it must.
 *
 * Something always fits. Every exit either returns bytes inside the budget or
 * falls through to a floor encode no photo can exceed, so the "could not be
 * compressed" error is unreachable for a picture the browser could decode.
 */
async function encodeWithin(bitmap, type, startEdge, budgetBytes) {
  const state = { jpegOnly: type !== "image/webp" };
  const fmt = () => (state.jpegOnly ? "image/jpeg" : type);

  let edge = startEdge;
  let best = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let last = null;
    let softened = false;
    for (const quality of QUALITY_LADDER) {
      const blob = await encodeOnce(bitmap, fmt(), edge, quality, state);
      if (!blob) break;
      last = blob;
      if (blob.size <= budgetBytes) return blob;
      if (blob.size > budgetBytes * LADDER_RESCUE) break;   // hopeless at this size
      softened = true;
    }
    if (!last) {
      // Nothing encodes at this size at all - go smaller and try again.
      const smaller = Math.round(edge * 0.6);
      if (smaller < MIN_EDGE) break;
      edge = smaller;
      continue;
    }
    best = last;
    // If the ladder ran to the end, `last` is the softest encode and an honest
    // basis. If it broke early there is still quality in hand, so aim higher.
    const aim = budgetBytes * (softened ? 1 : LADDER_RESERVE);
    const next = nextEdgeGuess(edge, last.size, aim);
    if (next === edge) break;
    edge = next;
  }

  // Last resort: the smallest thing this module will ever make. A photo that
  // does not fit here does not exist.
  if (!best || best.size > budgetBytes) {
    const floor = await encodeOnce(bitmap, fmt(), MIN_EDGE, 0.45, state);
    if (floor && (!best || floor.size < best.size)) best = floor;
  }
  return best;
}

export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) throw new Error("Could not read that image. Try a different photo.");

  try {
    const type = await bestFormat();
    // Sized for the screen it will be viewed on, and never upscaled: a photo
    // smaller than the display stays its own size rather than being blown up
    // into a bigger, blurrier file.
    const startEdge = Math.min(displayTargetEdge(), Math.max(bitmap.width, bitmap.height));

    const blob = await encodeWithin(bitmap, type, startEdge, MAX_DATA_BYTES);
    if (!blob || blob.size > MAX_DATA_BYTES) {
      throw new Error("That photo could not be compressed enough to upload. Try a cropped version.");
    }
    const data = await blobToDataUrl(blob);

    const thumbBlob = await encodeWithin(
      bitmap, type, Math.min(THUMB_EDGE, startEdge), MAX_THUMB_BYTES,
    );
    const thumb = thumbBlob ? await blobToDataUrl(thumbBlob) : data;

    // A data URL is only useful if it actually fits what the server accepts.
    if (data.length > MAX_DATA_CHARS || thumb.length > MAX_THUMB_CHARS) {
      throw new Error("That photo could not be compressed enough to upload. Try a cropped version.");
    }
    return { data, thumb };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Pure: the message to show after a batch upload. One failure out of many
 * should not read like total failure, and total failure should not read like
 * partial success. Returns "" when everything worked.
 */
export function batchResultMessage(added, failures) {
  if (failures.length === 0) return "";
  // Every photo in the batch hit the same wall - say it once, plainly.
  const unique = [...new Set(failures)];
  if (added === 0) {
    return unique.length === 1 ? unique[0] : `Could not add those photos. ${unique[0]}`;
  }
  return `Added ${added} of ${added + failures.length}. ${unique[0]}`;
}

// ── Swiping between photos ───────────────────────────────────────────────────

// A swipe counts when it travels far enough OR fast enough - a quick flick
// should turn the page even if the thumb barely moved.
const SWIPE_DISTANCE = 70;
const SWIPE_VELOCITY = 450;

/**
 * Pure: which photo a swipe lands on. Clamped, so a swipe past either end
 * springs back to where it was instead of running off the list.
 */
export function nextIndex(current, count, offsetX, velocityX) {
  const far = Math.abs(offsetX) > SWIPE_DISTANCE;
  const fast = Math.abs(velocityX) > SWIPE_VELOCITY;
  if (!far && !fast) return current;
  const step = (offsetX < 0 || velocityX < 0) ? 1 : -1;
  return Math.min(count - 1, Math.max(0, current + step));
}
