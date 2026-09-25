import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { photoUrl } from "../../lib/photoUrl.js";
import { batchResultMessage, MAX_BATCH } from "../../lib/photos.js";
import { addMediaBatch, addingLabel, MEDIA_ACCEPT } from "../../lib/addMedia.js";
import PhotoViewer from "../PhotoViewer.jsx";
import VideoBadge from "../VideoBadge.jsx";
import { fmtDateKey, MONO } from "./constants.js";
import { tapHaptic } from "../../lib/haptics.js";

// One plant's photo and video timeline: newest first, added from the plant's
// page. Each item is dated today and shows up on that day's journal page too,
// labeled with this plant.
export default function PlantPhotos({ growId, plantId, unitWord = "plant" }) {
  const pickerRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [progress, setProgress] = useState(null); // {done, total, fraction, video} while uploading
  const [error, setError] = useState("");
  const [viewIndex, setViewIndex] = useState(null);
  const busy = progress !== null;

  const load = () => {
    api.listPlantPhotos(growId, plantId)
      .then((d) => setPhotos(d.photos ?? []))
      .catch(() => setPhotos([]));
  };
  useEffect(load, [growId, plantId]);

  async function uploadAll(files) {
    setError("");
    setProgress({ done: 0, total: Math.min(files.length, MAX_BATCH), fraction: null, video: false });
    const { added, failures, truncated } = await addMediaBatch(files, {
      growId, date: ymd(new Date()), plantId, onProgress: setProgress,
    });
    if (added > 0) {
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
      load();
    }
    setError(
      truncated
        ? `Only the first ${MAX_BATCH} were added. ${batchResultMessage(added, failures)}`.trim()
        : batchResultMessage(added, failures),
    );
    setProgress(null);
  }

  function onPick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) uploadAll(files);
  }

  const addLabel = addingLabel(progress, { compact: true });

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
          Photos
        </span>
        <button
          type="button"
          onClick={() => { if (!busy) { tapHaptic(); pickerRef.current?.click(); } }}
          disabled={busy}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 18, padding: "7px 13px", color: "#fbbf24",
            fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}>
          <ImagePlus size={13} strokeWidth={2} />
          {addLabel ?? "Add"}
        </button>
      </div>

      {photos.length === 0 && !busy && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "4px 0" }}>
          No photos or videos of this {unitWord} yet.
        </div>
      )}

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { tapHaptic(); setViewIndex(i); }}
              aria-label={`Open ${p.kind === "video" ? "video" : "photo"} from ${fmtDateKey(p.date)}`}
              style={{
                padding: 0, border: "1px solid var(--c-border-faint)", borderRadius: 10,
                overflow: "hidden", cursor: "pointer", background: "var(--c-surface-2)",
                aspectRatio: "1 / 1", position: "relative",
              }}>
              <img
                src={photoUrl(p.id)}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {p.kind === "video" && <VideoBadge durationMs={p.durationMs} />}
              <span style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                padding: "3px 5px", background: "rgba(0,0,0,0.55)",
                fontFamily: "var(--font-num)", fontSize: 9, color: "white", textAlign: "left",
              }}>
                {fmtDateKey(p.date)}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-danger-soft)", marginTop: 8 }}>
          {error}
        </div>
      )}

      <input
        ref={pickerRef}
        type="file"
        accept={MEDIA_ACCEPT}
        multiple
        onChange={onPick}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {viewIndex !== null && photos.length > 0 && (
        <PhotoViewer
          growId={growId}
          photos={photos}
          startIndex={viewIndex}
          subtitleFor={(p) => fmtDateKey(p.date)}
          onClose={() => setViewIndex(null)}
          onDeleted={load}
        />
      )}
    </div>
  );
}
