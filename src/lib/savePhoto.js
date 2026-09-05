// Putting a picture the app took into the phone's own camera roll.
//
// A web page cannot write to the photo library. Nothing can, except the OS, and
// the only sanctioned way to ask is the Web Share API: hand the system a file
// and it offers "Save Image", which lands it in the roll. Where sharing files
// is unsupported (most desktops) a plain download is the honest fallback.
//
// ── The rule that makes or breaks this ───────────────────────────────────────
//
// navigator.share() only works during a "transient activation" - the brief
// window the browser grants after a real tap. Any `await` before the call spends
// that window, and iOS then throws NotAllowedError, which reads to the grower as
// "saving is broken" when the file was fine all along.
//
// So the work is split in two. Building the File is slow and async, and happens
// AHEAD of time. Handing it over is synchronous, and happens inside the tap.
// Never merge them back into one convenient async function.

const SHARE_TITLE = "Grow photo";

/**
 * Pure: a data URL to a Blob, decoded here rather than fetched.
 *
 * The obvious `fetch(dataUrl).then(r => r.blob())` is a trap in this app: the
 * page is served with `connect-src 'self'`, and a data: URL is not 'self', so
 * the browser refuses the connection and the fetch rejects. Every attempt to
 * save a photo failed on that line, on every platform, which is why it always
 * looked broken. Decoding the base64 by hand touches no network and no policy.
 */
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(dataUrl ?? ""));
  if (!m) throw new Error("not a data URL");
  const type = m[1] || "image/jpeg";
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const binary = atob(m[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Turn a stored data URL, Blob or File into a File the OS will accept. Do this early. */
export async function photoFileFrom(source, filename = "grow-photo.jpg") {
  if (typeof File !== "undefined" && source instanceof File) return source;
  let blob;
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    blob = source;
  } else if (typeof source === "string" && source.startsWith("data:")) {
    blob = dataUrlToBlob(source);
  } else {
    // A same-origin URL (the photo image route) is allowed through the policy.
    blob = await (await fetch(String(source))).blob();
  }
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/** Can this device hand a picture to the OS at all? */
export function canSharePhoto(file) {
  if (!file) return false;
  try { return Boolean(navigator.canShare?.({ files: [file] }) && navigator.share); }
  catch { return false; }
}

/**
 * Offer the file to the OS. MUST be called straight out of a tap handler with
 * no await in front of it, or the share sheet will not open.
 *
 * Resolves "shared" when the sheet was used, "cancelled" when it was dismissed,
 * and rejects with a real reason otherwise so the caller can say something true.
 */
export function sharePhoto(file) {
  let sharing;
  try {
    sharing = navigator.share({ files: [file], title: SHARE_TITLE });
  } catch (err) {
    return Promise.reject(err);          // synchronous throw, e.g. no activation
  }
  return sharing.then(() => "shared").catch((err) => {
    if (err?.name === "AbortError") return "cancelled";
    throw err;
  });
}

/** The desktop answer: put it in the downloads folder. */
export function downloadPhoto(file, filename = file?.name || "grow-photo.jpg") {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "downloaded";
}

/**
 * Save it however this device can. Synchronous entry, so the activation
 * survives; returns a promise describing what happened.
 */
export function savePhotoFile(file, filename) {
  if (!file) return Promise.reject(new Error("no file"));
  if (!canSharePhoto(file)) return Promise.resolve(downloadPhoto(file, filename));
  return sharePhoto(file);
}

/**
 * Pure: what to tell the grower. The failure modes are genuinely different and
 * lumping them into "could not save" is what made this feel broken.
 */
export function saveOutcomeMessage(outcome, error) {
  if (outcome === "saving")     return "Opening your phone's save sheet…";
  if (outcome === "shared")     return "Sent to your photos.";
  if (outcome === "downloaded") return "Downloaded.";
  if (outcome === "cancelled")  return "";
  if (outcome !== "error")      return "";

  const name = error?.name ?? "";
  if (name === "NotAllowedError") {
    return "Your phone would not open the save sheet. Tap Save to Photos again.";
  }
  if (name === "NotSupportedError" || name === "TypeError") {
    return "This browser cannot save into your photos. Open the app from your Home Screen and try again.";
  }
  return "Could not save that photo. Try again in a moment.";
}

// ── Whether new shots go to the roll on their own ────────────────────────────
//
// The app can offer, but only the grower can accept: the OS puts up its own
// sheet and there is no way around that on the web. This preference decides
// whether the offer happens by itself after every shot, or only when asked.

const ROLL_KEY = "savePhotosToRoll";

/** Defaults ON: a photo you took with this app is not in your roll otherwise. */
export function loadSaveToRoll() {
  try { return localStorage.getItem(ROLL_KEY) !== "0"; } catch { return true; }
}

export function rememberSaveToRoll(on) {
  try { localStorage.setItem(ROLL_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ }
}
