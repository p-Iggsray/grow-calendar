// Where the pixels actually live.
//
// Photos used to sit in D1 as base64 text in journal_photos.data. That was
// wrong in three ways at once: D1's roughly 1MB bound-parameter ceiling set
// every picture's quality, base64 added a flat third to the bytes, and 800
// photos of one grow put ~600MB in the same 10GB database as the record.
//
// Now the row stays in D1 and the bytes go to R2. The row carries the object
// keys instead of the images, and reads STREAM: an R2 body goes straight into
// the Response without the worker ever holding the picture. That is what makes
// the size of a photo stop mattering.
//
// ── Reading during the migration ─────────────────────────────────────────────
//
// Old rows still have their base64 and no keys; new rows have keys and empty
// blob columns. Every read resolves the key first and only falls back to the
// column when there is no key, so both kinds work at once and the backfill can
// take as long as it likes. When the bucket is not bound at all (a deploy that
// has not been given one yet) writes go to D1 exactly as they used to, so the
// app never loses the ability to save a photo over a missing binding.

import { base64ToBytes } from "./util.js";

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s;

/** Is there anywhere to put bytes? */
export function hasPhotoStore(env) {
  return Boolean(env?.PHOTOS);
}

/**
 * Pure: the object key for one size of one photo.
 *
 * User first so a prefix list scopes to an account, which is what both the
 * cleanup path and any future per-user export need. The key is never a secret:
 * the bucket is private and every read goes through the worker, which checks
 * user_id in D1 before it touches R2 at all.
 */
export function photoKey(userId, photoId, size) {
  return `u${userId}/${photoId}.${size === "full" ? "full" : "thumb"}`;
}

/** Pure: split a data URL into its type and its bytes, or null if it is not one. */
export function decodeDataUrl(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl ?? ""));
  if (!m) return null;
  try {
    return { contentType: m[1], bytes: base64ToBytes(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Put one image in the bucket. Returns the key, or null if it could not be
 * stored, which the caller must treat as a reason to keep the base64 in D1
 * rather than as a reason to lose the photo.
 */
export async function putPhoto(env, userId, photoId, size, dataUrl) {
  if (!hasPhotoStore(env)) return null;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const key = photoKey(userId, photoId, size);
  await env.PHOTOS.put(key, decoded.bytes, {
    httpMetadata: { contentType: decoded.contentType },
  });
  return key;
}

/**
 * Both sizes of one photo, or null if either fails.
 *
 * All or nothing on purpose. A row that pointed at a stored full image and a
 * missing thumbnail would render as a broken tile forever, and there is no
 * cheap way to notice. Falling back to D1 for the whole photo is recoverable;
 * a half-written photo is not.
 */
export async function putPhotoPair(env, userId, photoId, { data, thumb }) {
  if (!hasPhotoStore(env)) return null;
  try {
    const [dataKey, thumbKey] = await Promise.all([
      putPhoto(env, userId, photoId, "full", data),
      putPhoto(env, userId, photoId, "thumb", thumb),
    ]);
    if (!dataKey || !thumbKey) {
      await deletePhotoObjects(env, [dataKey, thumbKey]);
      return null;
    }
    return { dataKey, thumbKey };
  } catch {
    await deletePhotoObjects(env, [
      photoKey(userId, photoId, "full"),
      photoKey(userId, photoId, "thumb"),
    ]);
    return null;
  }
}

/**
 * Read an object as a streaming Response body.
 *
 * Returns the R2 object itself rather than bytes so the caller can hand
 * `.body` to a Response untouched. Null means the key is not there, which
 * during the migration is a reason to look in D1, not an error.
 */
export async function getPhotoObject(env, key) {
  if (!hasPhotoStore(env) || !key) return null;
  try {
    return await env.PHOTOS.get(key);
  } catch {
    return null;
  }
}

/**
 * Delete objects, never throwing.
 *
 * A photo the grower deleted is gone from the journal the moment its row goes,
 * and failing the request because the bucket was briefly unhappy would only
 * mean the row survives too. An orphaned object costs a fraction of a cent and
 * can be swept later; a delete that appears not to work is worse.
 */
export async function deletePhotoObjects(env, keys) {
  const real = (keys ?? []).filter(Boolean);
  if (!hasPhotoStore(env) || !real.length) return;
  try {
    await env.PHOTOS.delete(real);
  } catch { /* orphan, see above */ }
}

/**
 * Pure: the URL an <img> uses for a photo.
 *
 * Everything that used to embed a data URL now sends one of these instead. The
 * browser gets to lazy-load, cache, and skip what never scrolls into view, none
 * of which is possible with bytes already inlined in a JSON payload.
 */
export function photoUrl(photoId, size) {
  return `/api/photos/${photoId}/${size === "full" ? "full" : "thumb"}`;
}
