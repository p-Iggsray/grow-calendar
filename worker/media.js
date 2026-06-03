// @ts-check
import { json, error } from "./util.js";

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;  // 8 MB
const AUDIO_MAX_BYTES = 3 * 1024 * 1024;  // 3 MB
const PHOTOS_PER_DAY  = 10;

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);
const ALLOWED_AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"]);

function typeToExt(mimeType) {
  const map = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic",
    "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg",
    "audio/mpeg": "mp3", "audio/wav": "wav",
  };
  return map[mimeType] ?? "bin";
}

/** POST /api/media/upload?date=YYYY-MM-DD&type=photo|audio */
export async function postMediaUpload(request, env, user) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const kind = url.searchParams.get("type");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error(400, "date required (YYYY-MM-DD)");
  if (kind !== "photo" && kind !== "audio") return error(400, "type must be photo or audio");

  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const allowedTypes = kind === "photo" ? ALLOWED_PHOTO_TYPES : ALLOWED_AUDIO_TYPES;
  if (!allowedTypes.has(contentType)) return error(415, `unsupported ${kind} type: ${contentType}`);

  const maxBytes = kind === "photo" ? PHOTO_MAX_BYTES : AUDIO_MAX_BYTES;
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return error(400, "empty body");
  if (body.byteLength > maxBytes) return error(413, `${kind} too large (max ${maxBytes / 1024 / 1024} MB)`);

  if (kind === "photo") {
    const { count } = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM media WHERE user_id = ? AND date = ? AND kind = 'photo'"
    ).bind(user.id, date).first();
    if (count >= PHOTOS_PER_DAY) return error(429, `max ${PHOTOS_PER_DAY} photos per day`);
  } else {
    // Audio: one per day — delete existing if present
    const existing = await env.DB.prepare(
      "SELECT r2_key FROM media WHERE user_id = ? AND date = ? AND kind = 'audio'"
    ).bind(user.id, date).first();
    if (existing) {
      await env.MEDIA.delete(existing.r2_key);
      await env.DB.prepare(
        "DELETE FROM media WHERE user_id = ? AND date = ? AND kind = 'audio'"
      ).bind(user.id, date).run();
    }
  }

  const uid = crypto.randomUUID();
  const ext = typeToExt(contentType);
  const r2Key = `${kind}/${user.id}/${date}/${uid}.${ext}`;

  await env.MEDIA.put(r2Key, body, {
    httpMetadata: { contentType },
    customMetadata: { userId: String(user.id), date, kind },
  });

  const now = new Date().toISOString();
  const { meta } = await env.DB.prepare(
    "INSERT INTO media (user_id, date, kind, r2_key, mime_type, size_bytes, created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(user.id, date, kind, r2Key, contentType, body.byteLength, now).run();

  return json({ id: meta.last_row_id, r2_key: r2Key, kind, date }, { status: 201 });
}

/** GET /api/media?date=YYYY-MM-DD */
export async function getMediaList(request, env, user) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error(400, "date required (YYYY-MM-DD)");

  const { results } = await env.DB.prepare(
    "SELECT id, kind, r2_key, mime_type, size_bytes, created_at FROM media WHERE user_id = ? AND date = ? ORDER BY created_at ASC"
  ).bind(user.id, date).all();

  return json({ items: results ?? [] });
}

/** GET /api/media/:id — streams the R2 object */
export async function getMediaItem(request, env, user, id) {
  const row = await env.DB.prepare(
    "SELECT r2_key, mime_type FROM media WHERE id = ? AND user_id = ?"
  ).bind(id, user.id).first();
  if (!row) return error(404, "not found");

  const obj = await env.MEDIA.get(row.r2_key);
  if (!obj) return error(404, "object not found in storage");

  return new Response(obj.body, {
    headers: {
      "content-type": row.mime_type,
      "cache-control": "private, max-age=86400",
    },
  });
}

/** DELETE /api/media/:id */
export async function deleteMediaItem(request, env, user, id) {
  const row = await env.DB.prepare(
    "SELECT r2_key FROM media WHERE id = ? AND user_id = ?"
  ).bind(id, user.id).first();
  if (!row) return error(404, "not found");

  await Promise.all([
    env.MEDIA.delete(row.r2_key),
    env.DB.prepare("DELETE FROM media WHERE id = ? AND user_id = ?").bind(id, user.id).run(),
  ]);

  return json({ ok: true });
}
