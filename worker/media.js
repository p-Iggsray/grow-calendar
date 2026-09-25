// R2, where journal videos live. Everything here is about the bucket itself:
// storing, streaming and removing files. What a video IS (its row, its poster,
// who may add one) is in worker/videos.js.
import { error } from "./util.js";
import { logError } from "./log.js";

// R2 removes at most this many keys in one call.
const R2_DELETE_BATCH = 1000;

/** Is the bucket bound? A deploy without it must say so, not crash. */
export function hasMediaBucket(env) {
  return Boolean(env?.MEDIA && typeof env.MEDIA.get === "function");
}

export function mediaUnavailable() {
  return error(503, "video storage is not set up on this server yet");
}

/**
 * Remove files from the bucket. Best effort: a failure is logged and swallowed,
 * because every caller has already deleted the rows, and an orphaned file costs
 * storage while a thrown error here would cost the grower their delete.
 */
export async function deleteMediaObjects(env, keys) {
  const list = (keys ?? []).filter((k) => typeof k === "string" && k);
  if (!list.length || !hasMediaBucket(env)) return;
  for (let i = 0; i < list.length; i += R2_DELETE_BATCH) {
    try {
      await env.MEDIA.delete(list.slice(i, i + R2_DELETE_BATCH));
    } catch (err) {
      logError("media-delete-failed", { count: list.length, message: String(err?.message) });
    }
  }
}

/**
 * Pure: turn what R2 says it read (`{ offset, length }` or `{ suffix }`) into
 * the first byte, the byte count, and the Content-Range header for a 206.
 * Returns null when the range cannot be satisfied.
 */
export function contentRange(range, size) {
  const total = Number(size);
  if (!range || !Number.isFinite(total) || total <= 0) return null;
  let offset;
  let length;
  if (range.suffix !== undefined) {
    length = Math.min(Number(range.suffix), total);
    offset = total - length;
  } else {
    offset = Number(range.offset ?? 0);
    length = range.length !== undefined ? Number(range.length) : total - offset;
  }
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length <= 0 || offset >= total) {
    return null;
  }
  length = Math.min(length, total - offset);
  return { offset, length, header: `bytes ${offset}-${offset + length - 1}/${total}` };
}

/**
 * Stream a stored file with Range support.
 *
 * Range is not optional here: Safari will not play a video from a server that
 * answers every request with the whole file, and scrubbing anywhere would mean
 * downloading everything before it.
 */
export async function streamMediaObject(env, key, request, fallbackType) {
  if (!hasMediaBucket(env)) return mediaUnavailable();
  const wantsRange = request.headers.has("range");
  let obj;
  try {
    obj = await env.MEDIA.get(key, wantsRange ? { range: request.headers } : undefined);
  } catch (err) {
    // R2 refuses a range past the end of the file rather than clamping it.
    const head = await env.MEDIA.head(key).catch(() => null);
    if (!head) return error(404, "video not found");
    logError("media-range-refused", { message: String(err?.message) });
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${head.size}` } });
  }
  if (!obj) return error(404, "video not found");

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type")) headers.set("content-type", fallbackType || "video/mp4");
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  // Same reasoning as a photo: the owner's own file, never in a shared cache,
  // and an id that will never name anything else.
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");

  const part = wantsRange ? contentRange(obj.range, obj.size) : null;
  if (part) {
    headers.set("content-range", part.header);
    headers.set("content-length", String(part.length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}
