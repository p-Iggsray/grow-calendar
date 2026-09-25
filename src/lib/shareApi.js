// The friend view's whole connection to the server.
//
// Everything a share link can read goes through here, and nothing here writes.
// The token is bound once so no caller has to remember to pass it, and no
// caller can accidentally reach a route outside the shared surface.

async function get(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) {
    let message = "Something went wrong loading this.";
    try { message = (await res.json()).error || message; } catch { /* not json */ }
    throw new Error(message);
  }
  return res.json();
}

export function shareApi(token) {
  const base = `/api/share/${encodeURIComponent(token)}`;
  return {
    spaces:   ()                 => get(base),
    month:    (growId, month)    => get(`${base}/grows/${growId}/month/${month}`),
    day:      (growId, date)     => get(`${base}/grows/${growId}/day/${date}`),
    timeline: (growId, before)   => get(`${base}/grows/${growId}/timeline${before ? `?before=${before}` : ""}`),
    photos:   (growId, offset)   => get(`${base}/grows/${growId}/photos${offset ? `?offset=${offset}` : ""}`),
    photoUrl: (photoId, size = "thumb") =>
      `${base}/photos/${encodeURIComponent(photoId)}/${size === "full" ? "full" : "thumb"}`,
    videoUrl: (videoId) => `${base}/videos/${encodeURIComponent(videoId)}`,
  };
}
