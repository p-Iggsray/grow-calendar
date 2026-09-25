import { Play } from "lucide-react";
import { formatDuration } from "../lib/videos.js";

// What marks a tile as a video: a play mark and the clip's length, in the top
// corner so it never collides with the plant or date label along the bottom.
export default function VideoBadge({ durationMs }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute", top: 5, right: 5,
        display: "flex", alignItems: "center", gap: 3,
        padding: "2px 6px 2px 5px", borderRadius: 9,
        background: "rgba(0,0,0,0.62)", color: "white",
        fontFamily: "var(--font-num)", fontSize: 9.5, fontWeight: 600, lineHeight: 1.4,
        pointerEvents: "none",
      }}>
      <Play size={9} strokeWidth={0} fill="currentColor" />
      {durationMs ? formatDuration(durationMs) : null}
    </span>
  );
}
