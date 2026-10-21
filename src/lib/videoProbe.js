// Why a <video> would not play. The element itself only says "error", and a
// dropped connection, an ended session and a format the browser cannot decode
// all look the same from there, but they need different answers.

/**
 * Pure: the reason for an HTTP status from asking the video route for its
 * first byte. 200 or 206 means the file is there and readable, so the browser
 * refused the format itself.
 */
export function videoFailureReason(status) {
  if (status === 200 || status === 206) return "format";
  if (status === 401) return "signed-out";
  if (status === 404) return "missing";
  return "offline";
}

// MediaError codes (HTMLMediaElement.error.code).
const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;

/**
 * Why a clip would not play, from the element's own error code where that is
 * enough. A network or aborted load is never the format, whatever a probe
 * made afterwards finds; a decode failure always is. Only "source not
 * supported" is ambiguous (an HTTP error lands there too), so that one asks
 * the server for one byte of the clip.
 */
export async function whyVideoFailed(url, errorCode) {
  if (errorCode === MEDIA_ERR_ABORTED || errorCode === MEDIA_ERR_NETWORK) return "offline";
  if (errorCode === MEDIA_ERR_DECODE) return "format";
  try {
    const res = await fetch(url, { credentials: "same-origin", headers: { range: "bytes=0-0" } });
    return videoFailureReason(res.status);
  } catch {
    return "offline";
  }
}
