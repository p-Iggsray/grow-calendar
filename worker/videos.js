// Journal videos: adding one, and playing it back.
//
// A video arrives in two requests, file first:
//
//   PUT  /api/grows/:id/videos/upload?date=YYYY-MM-DD   the raw file, into R2
//   POST /api/grows/:id/videos                           its row and poster
//
// File first, so a journal never shows a tile whose video is not there. If the
// second request never comes, what is left behind is an unreferenced file in
// the bucket, which costs storage but never shows the grower anything broken.
//
// The file is streamed straight from the request into R2. Reading it into
// memory first would put up to 100 MB inside a Worker that has 128.
import { json, error, nowIso, safeJsonBounded } from "./util.js";
import { ownedGrowRow } from "./plants.js";
import { logError } from "./log.js";
import {
  ensureJournalPhotosSchema, newPhotoId, plantInGrow,
  mediaCountForDay, mediaCountForGrow, mediaListItem,
  MAX_PER_DAY, DAY_FULL_MESSAGE,
} from "./photos.js";
import { hasMediaBucket, mediaUnavailable, deleteMediaObjects, streamMediaObject } from "./media.js";
import {
  MAX_VIDEO_BYTES, MAX_VIDEOS_PER_GROW, durationFits, videoMimeOf,
} from "../src/lib/videos.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
// Same ceiling as a photo's thumbnail: the poster is shown in the same tiles.
const MAX_THUMB_CHARS = 80_000;
const COMMIT_BODY_BYTES = MAX_THUMB_CHARS + 4096;
const UPLOAD_ID_RE = /^[0-9a-f-]{36}$/;
const VIDEO_ID_RE = /^[A-Za-z0-9_]{1,60}$/;

const TOO_BIG_MESSAGE = "that video is over 100 MB. Trim it to under a minute and try again.";
const GROW_FULL_MESSAGE = `this grow already holds ${MAX_VIDEOS_PER_GROW} videos`;

/** Pure: where one grow's videos live in the bucket. */
export function videoKeyPrefix(userId, growId) {
  return `videos/${userId}/${growId}/`;
}

/** Pure: is this key one this user could have uploaded to this grow? */
export function isOwnUploadKey(key, userId, growId) {
  if (typeof key !== "string") return false;
  const prefix = videoKeyPrefix(userId, growId);
  return key.startsWith(prefix) && UPLOAD_ID_RE.test(key.slice(prefix.length));
}

/**
 * Pure: can this request's headers be stored as a video? Returns
 * `{ ok: true, mime, bytes }` or `{ ok: false, status, message }`.
 */
export function checkVideoUploadHeaders(contentType, contentLength) {
  const mime = videoMimeOf({ type: contentType });
  if (!mime) return { ok: false, status: 415, message: "that file is not a video this app can store (mp4, mov or webm)" };
  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, status: 411, message: "the video's size was not sent" };
  }
  if (bytes > MAX_VIDEO_BYTES) return { ok: false, status: 413, message: TOO_BIG_MESSAGE };
  return { ok: true, mime, bytes };
}

/** Pure: validate the second request, the row. `{ ok: true }` or `{ ok: false, message }`. */
export function validateVideoInput(body) {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return { ok: false, message: "date must be YYYY-MM-DD" };
  }
  if (typeof body.uploadKey !== "string" || !body.uploadKey) {
    return { ok: false, message: "uploadKey is required" };
  }
  if (typeof body.thumb !== "string" || !THUMB_RE.test(body.thumb)) {
    return { ok: false, message: "thumb must be a base64 image data URL" };
  }
  if (body.thumb.length > MAX_THUMB_CHARS) return { ok: false, message: "poster frame is too large" };
  if (!durationFits(body.durationMs)) {
    return { ok: false, message: "videos can be at most a minute long" };
  }
  if (body.plantId !== undefined && body.plantId !== null) {
    if (typeof body.plantId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.plantId)) {
      return { ok: false, message: "invalid plantId" };
    }
  }
  if (body.fromCamera !== undefined && typeof body.fromCamera !== "boolean") {
    return { ok: false, message: "fromCamera must be true or false" };
  }
  return { ok: true };
}

/** Room for one more video on this day and in this grow, or the reason not. */
async function roomForVideo(env, growId, date) {
  const [dayCount, growCount] = await Promise.all([
    mediaCountForDay(env, growId, date),
    mediaCountForGrow(env, growId, "video"),
  ]);
  if (dayCount >= MAX_PER_DAY) return DAY_FULL_MESSAGE;
  if (growCount >= MAX_VIDEOS_PER_GROW) return GROW_FULL_MESSAGE;
  return null;
}

// PUT /api/grows/:id/videos/upload?date=YYYY-MM-DD - the file, raw.
export async function uploadVideoFile(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  if (!hasMediaBucket(env)) return mediaUnavailable();

  const checked = checkVideoUploadHeaders(
    request.headers.get("content-type"), request.headers.get("content-length"),
  );
  if (!checked.ok) return error(checked.status, checked.message);
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return error(400, "date must be YYYY-MM-DD");
  if (!request.body) return error(400, "no video was sent");

  // Asked before the upload, not only after: turning a 90 MB file away once it
  // has crossed a cellular connection is the worst time to say no.
  await ensureJournalPhotosSchema(env);
  const full = await roomForVideo(env, growId, date);
  if (full) return error(400, full);

  const key = videoKeyPrefix(user.id, growId) + crypto.randomUUID();
  try {
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: checked.mime } });
  } catch (err) {
    logError("video-upload-failed", { message: String(err?.message) });
    return error(500, "could not store the video");
  }
  return json({ uploadKey: key });
}

// POST /api/grows/:id/videos {date, uploadKey, thumb, durationMs, plantId?, fromCamera?}
export async function createJournalVideo(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  if (!hasMediaBucket(env)) return mediaUnavailable();
  const p = await safeJsonBounded(request, COMMIT_BODY_BYTES);
  if (!p.ok) return error(p.status, p.error);
  const v = validateVideoInput(p.data);
  if (!v.ok) return error(400, v.message);
  const { date, uploadKey, thumb, durationMs } = p.data;
  if (!isOwnUploadKey(uploadKey, user.id, growId)) return error(400, "that upload does not belong to this grow");

  const plantId = p.data.plantId ?? null;
  if (plantId && !plantInGrow(row, plantId)) return error(404, "plant not found");
  await ensureJournalPhotosSchema(env);

  // The bucket, not the client, says how big the file is and what it is.
  const head = await env.MEDIA.head(uploadKey).catch(() => null);
  if (!head) return error(400, "that upload did not arrive. Try adding the video again.");
  const taken = await env.DB.prepare("SELECT id FROM journal_photos WHERE r2_key = ?").bind(uploadKey).first();
  if (taken) return error(409, "that video has already been added");

  const full = await roomForVideo(env, growId, date);
  if (full) {
    await deleteMediaObjects(env, [uploadKey]);
    return error(400, full);
  }

  const id = newPhotoId();
  const mime = videoMimeOf({ type: head.httpMetadata?.contentType }) ?? "video/mp4";
  const fromCamera = p.data.fromCamera === true ? 1 : 0;
  const duration = Math.round(durationMs);
  try {
    await env.DB.prepare(
      `INSERT INTO journal_photos
         (id, user_id, grow_id, date, plant_id, from_camera, kind, data, thumb, r2_key, mime, size_bytes, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'video', '', ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, growId, date, plantId, fromCamera, thumb, uploadKey, mime, head.size, duration, nowIso()).run();
  } catch (err) {
    logError("video-create-failed", { message: String(err?.message) });
    await deleteMediaObjects(env, [uploadKey]);
    return error(500, "could not save the video");
  }
  return json({
    photo: mediaListItem({
      id, date, plant_id: plantId, from_camera: fromCamera, kind: "video", duration_ms: duration, mime,
    }),
  });
}

// GET /api/videos/:id - the owner's video, streamed with Range support.
export async function getVideo(request, env, user, videoId) {
  if (!VIDEO_ID_RE.test(String(videoId ?? ""))) return error(400, "invalid video id");
  await ensureJournalPhotosSchema(env);
  const row = await env.DB.prepare(
    "SELECT r2_key, mime FROM journal_photos WHERE id = ? AND user_id = ? AND kind = 'video'"
  ).bind(videoId, user.id).first();
  if (!row?.r2_key) return error(404, "video not found");
  return streamMediaObject(env, row.r2_key, request, row.mime);
}
