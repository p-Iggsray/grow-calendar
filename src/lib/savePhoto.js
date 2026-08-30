// Saving a picture the app took into the phone's own camera roll.
//
// A web app cannot write to the photo library directly - only the OS can. The
// Web Share API is the sanctioned route: sharing a file offers the system's
// "Save Image" action, which puts it in the camera roll. Where sharing files
// is unsupported (most desktops) we fall back to a plain download.

// Turn a stored data URL back into a File the OS can accept.
async function dataUrlToFile(dataUrl, name) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/**
 * Offer the photo to the OS so the grower can put it in their camera roll.
 * Returns "shared" | "downloaded" | "cancelled".
 * Must be called from a user gesture (a tap) or the share sheet is blocked.
 */
export async function savePhotoToDevice(dataUrl, filename = "grow-photo.jpg") {
  const file = await dataUrlToFile(dataUrl, filename);

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // The grower dismissed the sheet - not an error worth reporting.
      if (err?.name === "AbortError") return "cancelled";
      // Anything else falls through to the download path below.
    }
  }

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
