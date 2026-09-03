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
//
// One rule sits above all of that: a photo you took is never refused. There is
// no picture too big or too grainy for this file, because when the measured
// search runs out of ideas the size simply keeps coming down until something
// fits, and the last rung is a postage stamp. Attaching a soft photo is always
// the right answer; telling somebody to go and crop it themselves is not. The
// only failure left is a browser that will not encode at any size at all, and
// that is reported as what it is - the phone being out of room - rather than
// being blamed on the photo.

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
const MIN_EDGE = 480;             // the smallest size we would LIKE to store
const HARD_MIN_EDGE = 120;        // the smallest we will ever store rather than refuse
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
 * Clamped so it always makes progress and never stops above MIN_EDGE, which is
 * where the measured search hands over to the descent.
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

// Hand a canvas's pixels back to the phone. A 12MP intermediate is 48MB of
// backing store, and iOS is slow to collect them on its own - which is exactly
// how a batch of photos ends with a canvas that will not encode anything.
function release(canvas) {
  try { canvas.width = 1; canvas.height = 1; } catch { /* already gone */ }
}

// Let the collector actually run. An encode that returned nothing is usually a
// phone that is momentarily out of room rather than one that is out of luck.
const yieldTick = () => new Promise((r) => setTimeout(r, 0));

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

// One resampling step, or null if the phone will not give us a canvas to draw
// on. A canvas past the platform's area limit hands back a null context rather
// than throwing, and every caller here has somewhere smaller to go.
function paint(src, w, h) {
  let canvas;
  try {
    canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    return canvas;
  } catch {
    if (canvas) release(canvas);
    return null;
  }
}

// Draw the bitmap at a target edge. Browsers default to a fast, low-quality
// resample, and a single big reduction is softer still, so: ask for the good
// filter, and get there by halving until the last step is a gentle one. Each
// intermediate is freed the moment the next one has been drawn from it.
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
    const step = paint(src, w, h);
    if (!step) {
      if (canvas) release(canvas);
      return null;
    }
    if (canvas) release(canvas);   // the previous step has been read; let it go
    src = step;
    srcW = w;
    srcH = h;
    canvas = step;
  }

  if (srcW === targetW && srcH === targetH && canvas) return canvas;

  const out = paint(src, targetW, targetH);
  if (canvas) release(canvas);
  return out;
}

// Draw at this size, encode, hand the canvas straight back. Returns null rather
// than throwing for every way a phone can decline: no context, no bytes, a
// rejected convertToBlob.
async function tryEncode(bitmap, type, edge, quality) {
  const canvas = drawAt(bitmap, edge);
  if (!canvas) return null;
  try {
    return await canvasToBlob(canvas, type, quality);
  } finally {
    release(canvas);
  }
}

// One encode, tolerant of a canvas that will not produce bytes. A phone that is
// short on memory, or a Safari that will not encode WebP at this size, returns
// null rather than throwing - and a null used to abort the whole upload with
// "could not be compressed enough", which was never true.
async function encodeOnce(bitmap, type, edge, quality, state) {
  const blob = await tryEncode(bitmap, type, edge, quality);
  if (blob) return blob;

  // Once WebP has failed at a real size, stop asking for it.
  if (state && type === "image/webp" && !state.jpegOnly) {
    state.jpegOnly = true;
    const jpeg = await tryEncode(bitmap, "image/jpeg", edge, quality);
    if (jpeg) return jpeg;
  }

  // Nothing came back in either format. Before writing this size off, give the
  // collector a turn and ask once - a phone half way through a batch of photos
  // is usually short of room for a moment, not for good. One reprieve per run,
  // re-armed whenever it works, so a genuinely dead canvas still fails fast.
  if (state && !state.starved) {
    state.starved = true;
    await yieldTick();
    const again = await tryEncode(bitmap, state.jpegOnly ? "image/jpeg" : type, edge, quality);
    if (again) {
      state.starved = false;
      return again;
    }
  }
  return null;
}

/**
 * Pure: the sizes and qualities the guaranteed descent walks through, from
 * `startEdge` down to the smallest picture this module will ever store.
 *
 * This is the rung the search falls onto when the ordinary hunt for a good
 * size has not landed. Each step is a big cut rather than a nudge, so it gets
 * to the bottom in a handful of encodes, and the bottom is small enough that
 * no image, however grainy, can miss the budget there.
 */
export function descentSteps(startEdge) {
  const steps = [];
  let edge = Math.max(HARD_MIN_EDGE, Math.min(Math.round(startEdge) || MIN_EDGE, MIN_EDGE));
  let quality = 0.45;
  for (;;) {
    steps.push({ edge, quality: Math.round(quality * 100) / 100 });
    if (edge <= HARD_MIN_EDGE) return steps;
    edge = Math.max(HARD_MIN_EDGE, Math.round(edge * 0.6));
    quality = Math.max(0.3, quality - 0.04);
  }
}

/**
 * Encode the largest, best-looking version that fits `budgetBytes`, or null if
 * this browser will not encode anything at all.
 *
 * Start at the size the screen can actually show, then give up QUALITY before
 * SIZE: a slightly softer photo at full screen resolution beats a crisp one too
 * small to fill the display. Only when the whole ladder has failed does the
 * picture shrink, and then by however much the measured bytes say it must.
 *
 * The result is never over budget. When the measured search runs out of rounds
 * the descent takes over and keeps halving until something fits, so the only
 * empty-handed exit is a canvas that produced no bytes at any size - a broken
 * phone, not a stubborn photo, and worth a different answer to the person.
 */
async function encodeWithin(bitmap, type, startEdge, budgetBytes, state) {
  const fmt = () => (state.jpegOnly ? "image/jpeg" : type);

  let edge = startEdge;
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
    // If the ladder ran to the end, `last` is the softest encode and an honest
    // basis. If it broke early there is still quality in hand, so aim higher.
    const aim = budgetBytes * (softened ? 1 : LADDER_RESERVE);
    const next = nextEdgeGuess(edge, last.size, aim);
    if (next === edge) break;
    edge = next;
  }

  // The search did not land. Walk down until something does. The last rung is
  // a postage stamp: a photo that will not fit there does not exist.
  for (const { edge: e, quality } of descentSteps(Math.min(startEdge, MIN_EDGE))) {
    const blob = await encodeOnce(bitmap, fmt(), e, quality, state);
    if (blob && blob.size <= budgetBytes) return blob;
  }
  return null;
}

// Encode, then check the thing we will actually send: the data URL. base64
// costs four characters per three bytes, so the byte budget is only an
// estimate of the character limit. If the estimate was optimistic, aim lower by
// exactly the overshoot and go again rather than failing on a rounding error.
async function encodeToDataUrl(bitmap, type, startEdge, budgetBytes, budgetChars, state) {
  let budget = budgetBytes;
  for (let attempt = 0; attempt < 3; attempt++) {
    const blob = await encodeWithin(bitmap, type, startEdge, budget, state);
    if (!blob) return null;
    const url = await blobToDataUrl(blob).catch(() => null);
    if (!url) return null;
    if (url.length <= budgetChars) return url;
    budget = Math.floor(budget * (budgetChars / url.length) * 0.96);
    if (budget < 512) return null;
  }
  return null;
}

// The formats the server will store, for the case where we send a file
// untouched because the canvas would not re-encode it.
const RAW_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// A 1x1 transparent PNG. Stands in when a thumbnail cannot be made at all, so
// a missing thumbnail costs you a grey tile in the grid rather than the photo.
const BLANK_THUMB =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ" +
  "AAAADUlEQVR42mNkYPhfDwAChwGA3fxvsgAAAABJRU5ErkJggg==";

// The picture as it already is, when it is small enough to store as-is. A
// browser that will not re-encode anything can still upload a modest JPEG.
async function rawIfItFits(file) {
  if (!RAW_TYPES.has(file?.type) || !(file.size > 0) || file.size > MAX_DATA_BYTES) return null;
  const url = await blobToDataUrl(file).catch(() => null);
  return url && url.length <= MAX_DATA_CHARS ? url : null;
}

export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) {
    // We cannot even decode it. If it is already small enough to store, keep it
    // whole rather than turning the person away over a format we cannot read.
    const raw = await rawIfItFits(file);
    if (raw) return { data: raw, thumb: raw.length <= MAX_THUMB_CHARS ? raw : BLANK_THUMB };
    throw new Error("Could not read that image. Try a different photo.");
  }

  try {
    const type = await bestFormat();
    const state = { jpegOnly: type !== "image/webp" };
    // Sized for the screen it will be viewed on, and never upscaled: a photo
    // smaller than the display stays its own size rather than being blown up
    // into a bigger, blurrier file.
    const startEdge = Math.min(displayTargetEdge(), Math.max(bitmap.width, bitmap.height));

    const data =
      (await encodeToDataUrl(bitmap, type, startEdge, MAX_DATA_BYTES, MAX_DATA_CHARS, state))
      ?? (await rawIfItFits(file));
    if (!data) {
      // Every size failed to produce bytes, so this is not a picture that
      // refuses to compress - it is a phone that has run out of room. Say that,
      // because cropping it would not have helped.
      throw new Error("Your phone ran out of room preparing that photo. Add a few at a time, or reopen the app and try again.");
    }

    // The thumbnail is a convenience, never a reason to lose the photo. If one
    // cannot be made, fall back to the full image when it is small enough to
    // pass as one, and to a blank tile when it is not.
    const thumb =
      (await encodeToDataUrl(bitmap, type, Math.min(THUMB_EDGE, startEdge), MAX_THUMB_BYTES, MAX_THUMB_CHARS, state))
      ?? (data.length <= MAX_THUMB_CHARS ? data : BLANK_THUMB);

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
