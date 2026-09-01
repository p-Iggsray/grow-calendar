// Photo helpers with no React in them: shrinking a file down to something
// storable, describing how a batch went, and deciding where a swipe lands.
// Kept out of the components so they can be unit-tested directly.
//
// ── Shrinking a phone photo ──────────────────────────────────────────────────
//
// The server caps an upload at 980k characters of base64. A FIXED size and
// quality cannot promise that, because how well a photo compresses depends on
// the picture: dense foliage - exactly what this app photographs - is the worst
// case for JPEG and used to sail past the cap, which the grower saw as "too
// large" on every try. So: render, measure, and step down until it genuinely
// fits.

const MAX_UPLOAD_CHARS = 700_000;  // server allows 980k - leave real headroom
const MAX_THUMB_CHARS = 70_000;    // server allows 80k
// Progressively smaller/softer renders. The first that fits wins.
const STEPS = [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.62], [800, 0.55], [640, 0.5]];
const THUMB_STEPS = [[320, 0.7], [240, 0.6], [180, 0.5]];

// How many files one pick may add at once. Guards against an accidental
// "select all" on a 3000-photo camera roll, and matches the server's per-day
// ceiling so a full batch can always land.
export const MAX_BATCH = 20;

export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) throw new Error("Could not read that image. Try a different photo.");

  const render = (maxEdge, quality) => {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };
  const fit = (steps, limit) => {
    let out = "";
    for (const [edge, q] of steps) {
      out = render(edge, q);
      if (out.length <= limit) return out;
    }
    return out; // smallest attempt, even if still over
  };

  try {
    const data = fit(STEPS, MAX_UPLOAD_CHARS);
    if (data.length > MAX_UPLOAD_CHARS) {
      throw new Error("That photo could not be compressed enough to upload. Try a cropped version.");
    }
    const thumb = fit(THUMB_STEPS, MAX_THUMB_CHARS);
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
