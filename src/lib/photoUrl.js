// Where a stored photograph is loaded from.
//
// Photos live in D1 as base64 data URLs, which is fine as storage and ruinous
// as a payload: a thumbnail is ~49 KB of text, so a journal day with twenty of
// them carried nearly a megabyte of base64 inside its JSON, and a plant's
// timeline carried one for every photograph it had ever had. The browser could
// not cache any of it, `loading="lazy"` had nothing to defer because the bytes
// had already arrived, and React held and diffed megabyte-long strings.
//
// So a list of photographs is a list of IDS, and the picture itself comes from
// here. /api/photos/:id/:size answers with real bytes under
// `private, max-age=31536000, immutable`, which is true: an id names one
// picture and will never name another. The browser then fetches only what
// scrolls into view, and never asks twice.
//
// The strain library has always worked this way. This is the rest of the app
// catching up with it.

/** The URL an <img> loads a stored photo from, at either size. */
export function photoUrl(id, size = "thumb") {
  return `/api/photos/${encodeURIComponent(id)}/${size === "full" ? "full" : "thumb"}`;
}

/** The URL a <video> streams a stored video from. Range requests work here. */
export function videoUrl(id) {
  return `/api/videos/${encodeURIComponent(id)}`;
}
