import { Film, RotateCw } from "lucide-react";

// What a viewer shows instead of a black screen when a clip will not play.
// The reason decides the words: a format this browser cannot decode (usually
// an iPhone's HEVC on Android or desktop Chrome) is final, anything else is
// worth another try.
const COPY = {
  format: {
    title: "This video will not play here",
    body: "It was saved fine, but this browser cannot play its format.",
  },
  offline: {
    title: "Could not load this video",
    body: "Check your connection and try again.",
  },
  "signed-out": {
    title: "Your session ended",
    body: "Sign in again to watch this video.",
  },
  missing: {
    title: "This video is gone",
    body: "It may have been deleted.",
  },
};

// On a share link a 404 means the link no longer reaches this video (revoked,
// or its space taken off the link), not that the grower deleted it.
const SHARED_MISSING = {
  title: "This video is not shared any more",
  body: "Ask the grower for a fresh link.",
};

export default function VideoUnplayable({ reason = "format", canSave = false, shared = false, onRetry }) {
  const copy = shared && reason === "missing" ? SHARED_MISSING : (COPY[reason] ?? COPY.offline);
  const retryable = reason === "offline" && onRetry;
  return (
    <div role="status" style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      maxWidth: 280, padding: 20, textAlign: "center",
      fontFamily: "var(--font-ui)", color: "rgba(255,255,255,0.85)",
    }}>
      <Film size={34} strokeWidth={1.6} aria-hidden="true" style={{ opacity: 0.7 }} />
      <div style={{ fontSize: 15, fontWeight: 700 }}>{copy.title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.65)" }}>
        {copy.body}
        {reason === "format" && (canSave
          ? " Save it from the menu to watch it in your Photos app."
          : " It plays on the phone that recorded it.")}
      </div>
      {retryable && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          className="touch-target"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4,
            padding: "8px 16px", borderRadius: 18, cursor: "pointer",
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff", fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: 700,
          }}>
          <RotateCw size={13} strokeWidth={2.2} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
