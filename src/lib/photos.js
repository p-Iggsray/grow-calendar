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

// Full native resolution for a normal phone camera (12MP is 4032x3024), so a
// photo is only ever shrunk because the byte budget forced it, never because we
// decided in advance. Bigger sensor modes come down to this: past it we would
// be storing grain, and decoding it on the phone gets slow.
const MAX_EDGE = 4096;
const MIN_EDGE = 640;          // below this a photo is not worth keeping
const THUMB_EDGE = 480;        // 3-up grid on a 3x screen, and the viewer's placeholder

// At a given size, use the best quality that fits. Only once even the FLOOR
// quality is too big do we give up pixels - for a fixed byte budget more pixels
// at decent quality beats fewer pixels at perfect quality, and pixels thrown
// away are gone for good. The floor is where compression starts to show.
const QUALITY_LADDER = [0.92, 0.86, 0.8, 0.74];
const QUALITY_FLOOR_STEPS = [0.68, 0.6];
const MAX_RESIZE_ATTEMPTS = 5;
// Walking the whole quality ladder only buys back about 2.5x in bytes. If the
// top quality came out further over budget than that, no amount of softening
// will save this size, so shrink immediately instead of burning several encodes
// of a huge canvas to learn what we already know. This is what keeps a photo
// that barely compresses - the worst case - from taking ten seconds.
const QUALITY_HEADROOM = 2.5;
// How much of that headroom to bank on when choosing the next size down.
const QUALITY_RESERVE = 1.7;

// How many files one pick may add at once. Guards against an accidental
// "select all" on a 3000-photo camera roll, and matches the server's per-day
// ceiling so a full batch can always land.
export const MAX_BATCH = 20;

/**
 * Pure: given an encode that came out too big, the edge length to try next.
 *
 * Bytes scale roughly with pixel count, and pixel count with the square of the
 * edge, so the square root of how far over budget we are is a good guess. The
 * 0.94 undershoots deliberately: one encode that lands just inside the budget
 * beats two that bracket it. Never grows, never drops below MIN_EDGE.
 */
export function nextEdgeGuess(edge, bytes, budget) {
  if (!(bytes > 0) || !(budget > 0)) return Math.max(MIN_EDGE, Math.round(edge * 0.75));
  const scale = Math.sqrt(budget / bytes) * 0.94;
  const next = Math.round(edge * Math.min(0.96, scale));   // always make progress
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
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
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

// Encode as large as the budget allows.
//
// Each size is drawn ONCE and then encoded at descending quality, because the
// redraw is the expensive part. If even the softest quality is too big, the
// picture shrinks and the loop goes round again.
async function encodeAt(bitmap, type, edge, budgetBytes) {
  const canvas = drawAt(bitmap, edge);
  const ladder = edge <= MIN_EDGE
    ? [...QUALITY_LADDER, ...QUALITY_FLOOR_STEPS]   // last resort: soften further
    : QUALITY_LADDER;
  let last = null;
  let softened = false;
  for (const quality of ladder) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob) break;
    last = blob;
    if (blob.size <= budgetBytes) return { fit: blob, over: null, softened };
    // Hopeless at this size: stop softening and go smaller.
    if (blob.size > budgetBytes * QUALITY_HEADROOM) break;
    softened = true;
  }
  return { fit: null, over: last, softened };
}

async function encodeWithin(bitmap, type, startEdge, budgetBytes) {
  let edge = startEdge;
  let smallest = null;     // fallback when nothing ever fits

  for (let attempt = 0; attempt < MAX_RESIZE_ATTEMPTS; attempt++) {
    const { fit, over, softened } = await encodeAt(bitmap, type, edge, budgetBytes);
    if (fit) return fit;
    if (!over) break;
    smallest = over;
    // `over` was measured at the TOP quality unless the ladder was walked, so
    // there is still compression in hand. Aim at a budget inflated by what
    // softening will win back, or the next size lands far smaller than it had
    // to and pixels are thrown away for nothing.
    const aim = budgetBytes * (softened ? 1 : QUALITY_RESERVE);
    const next = nextEdgeGuess(edge, over.size, aim);
    if (next === edge) break;      // already as small as we go
    edge = next;
  }

  return smallest;
}

export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) throw new Error("Could not read that image. Try a different photo.");

  try {
    const type = await bestFormat();
    // Never upscale: a small photo stays its own size rather than being blown
    // up into a bigger, blurrier file.
    const startEdge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));

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
