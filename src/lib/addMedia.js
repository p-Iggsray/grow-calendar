// Adding what was picked to the journal, photo or video, one at a time.
//
// The journal card and a plant's page both add media the same way, so the loop
// lives here once. Components keep their own state and pass callbacks in.

import { api } from "./api.js";
import { fileToDataUrls, readVideoFile, MAX_BATCH } from "./photos.js";
import { isVideoFile, videoMimeOf, durationFits, MAX_VIDEO_BYTES, looksFreshFromCamera } from "./videos.js";

// The one picker behind the one add button. No `capture`, so the OS sheet
// offers the camera (photo or video) and the library side by side.
export const MEDIA_ACCEPT = "image/*,video/*";

const WRONG_FORMAT = "That video format cannot be stored here. Use an mp4 or mov.";
const TOO_BIG = "That video is over 100 MB. Trim it to under a minute and try again.";
const TOO_LONG = "Videos can be at most a minute long. Trim it and try again.";

async function addVideo(growId, file, { date, plantId, fromCamera, onProgress }) {
  const mime = videoMimeOf(file);
  if (!mime) throw new Error(WRONG_FORMAT);
  // Checked before anything is read or sent: this one needs no network at all.
  if (file.size > MAX_VIDEO_BYTES) throw new Error(TOO_BIG);
  const { durationMs, thumb } = await readVideoFile(file);
  if (!durationFits(durationMs)) throw new Error(TOO_LONG);
  const { uploadKey } = await api.uploadVideoFile(growId, date, file, mime, onProgress);
  return api.createJournalVideo(growId, {
    date, uploadKey, thumb, durationMs, fromCamera,
    ...(plantId ? { plantId } : {}),
  });
}

async function addPhoto(growId, file, { date, plantId, fromCamera }) {
  const { data, thumb } = await fileToDataUrls(file);
  return api.createJournalPhoto(growId, {
    date, data, thumb, fromCamera,
    ...(plantId ? { plantId } : {}),
  });
}

/**
 * Add a batch of picked files, in order, one at a time.
 *
 * One at a time on purpose. Each photo is most of a megabyte to compress and a
 * video can be a hundred to send; firing them together would spike memory on
 * the phone and hit the worker with simultaneous writes.
 *
 * `onProgress({ done, total, fraction, video })` fires as each item moves:
 * `fraction` is how far the current video's upload has got, or null for a
 * photo. Resolves `{ added, failures, truncated }`.
 */
export async function addMediaBatch(files, { growId, date, plantId = null, onProgress }) {
  const batch = files.slice(0, MAX_BATCH);
  const failures = [];
  let added = 0;
  const report = (fraction, video) =>
    onProgress?.({ done: added + failures.length, total: batch.length, fraction, video });

  for (const file of batch) {
    const video = isVideoFile(file);
    report(video ? 0 : null, video);
    const opts = {
      date, plantId,
      fromCamera: looksFreshFromCamera(file, files.length),
      onProgress: (fraction) => report(fraction, true),
    };
    try {
      await (video ? addVideo(growId, file, opts) : addPhoto(growId, file, opts));
      added++;
    } catch (err) {
      failures.push(err?.message || (video ? "Could not add that video." : "Could not add that photo."));
    }
  }
  report(null, false);
  return { added, failures, truncated: files.length > batch.length };
}

/** Pure: the add button's label while a batch is going up. */
export function addingLabel(progress, { compact = false } = {}) {
  if (!progress) return null;
  const { done, total, fraction, video } = progress;
  const step = Math.min(done + 1, total);
  const pct = video && fraction != null ? ` ${Math.round(fraction * 100)}%` : "";
  if (total > 1) return compact ? `${step}/${total}${pct}` : `Adding ${step} of ${total}${pct ? `,${pct}` : "…"}`;
  return video ? `Uploading${pct || "…"}` : "Adding…";
}

/** Pure: how full the progress bar is, counting a video part-way through. */
export function progressFraction(progress) {
  if (!progress?.total) return 0;
  const partial = progress.fraction ?? 0;
  return Math.min(1, (progress.done + partial) / progress.total);
}
