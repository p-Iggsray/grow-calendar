import { useEffect, useRef, useState } from "react";
import { Camera, Images } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { batchResultMessage, fileToDataUrls, MAX_BATCH } from "../../lib/photos.js";
import PhotoViewer from "../PhotoViewer.jsx";
import { fmtDateKey, MONO } from "./constants.js";
import { tapHaptic } from "../../lib/haptics.js";

// One plant's photo timeline: newest first, uploaded from the plant's page.
// Each photo is dated today and shows up on that day's journal page too,
// labeled with this plant.
export default function PlantPhotos({ growId, plantId }) {
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [progress, setProgress] = useState(null); // {done, total} while uploading
  const [error, setError] = useState("");
  const [viewIndex, setViewIndex] = useState(null);
  const busy = progress !== null;

  const load = () => {
    api.listPlantPhotos(growId, plantId)
      .then((d) => setPhotos(d.photos ?? []))
      .catch(() => setPhotos([]));
  };
  useEffect(load, [growId, plantId]);

  // One at a time: each photo is most of a megabyte, and firing a batch at
  // once would spike memory on the phone and hammer the worker.
  async function uploadAll(files, fromCamera) {
    const batch = files.slice(0, MAX_BATCH);
    setProgress({ done: 0, total: batch.length });
    setError("");
    const failures = [];
    let added = 0;
    for (const file of batch) {
      try {
        const { data, thumb } = await fileToDataUrls(file);
        await api.createJournalPhoto(growId, { date: ymd(new Date()), data, thumb, plantId, fromCamera });
        added++;
      } catch (err) {
        failures.push(err?.message || "Could not add that photo.");
      }
      setProgress({ done: added + failures.length, total: batch.length });
    }
    if (added > 0) {
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
      load();
    }
    setError(
      files.length > batch.length
        ? `Only the first ${MAX_BATCH} were added. ${batchResultMessage(added, failures)}`.trim()
        : batchResultMessage(added, failures),
    );
    setProgress(null);
  }

  function onPick(fromCamera) {
    return (e) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length) uploadAll(files, fromCamera);
    };
  }

  const addLabel = busy
    ? (progress.total > 1 ? `${progress.done + 1}/${progress.total}…` : "Adding…")
    : null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
          Photos
        </span>
        <div style={{ display: "flex", gap: 7 }}>
          <button
            type="button"
            onClick={() => { if (!busy) { tapHaptic(); cameraRef.current?.click(); } }}
            disabled={busy}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
              borderRadius: 18, padding: "7px 13px", color: "#fbbf24",
              fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}>
            <Camera size={13} strokeWidth={2} />
            {addLabel ?? "Take"}
          </button>
          <button
            type="button"
            onClick={() => { if (!busy) { tapHaptic(); libraryRef.current?.click(); } }}
            disabled={busy}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
              borderRadius: 18, padding: "7px 13px", color: "var(--c-text-dim)",
              fontFamily: MONO, fontSize: 11, cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}>
            <Images size={13} strokeWidth={2} />
            Choose
          </button>
        </div>
      </div>

      {photos.length === 0 && !busy && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "4px 0" }}>
          No photos of this plant yet.
        </div>
      )}

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { tapHaptic(); setViewIndex(i); }}
              aria-label={`Open photo from ${fmtDateKey(p.date)}`}
              style={{
                padding: 0, border: "1px solid var(--c-border-faint)", borderRadius: 10,
                overflow: "hidden", cursor: "pointer", background: "var(--c-surface-2)",
                aspectRatio: "1 / 1", position: "relative",
              }}>
              <img
                src={p.thumb}
                alt=""
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
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
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick(true)}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick(false)}
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
