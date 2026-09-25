import { useEffect, useRef, useState } from "react";
import { Camera, Download, ImagePlus, X } from "lucide-react";
import { ymd } from "../../lib/api.js";
import { photoUrl } from "../../lib/photoUrl.js";
import { tapHaptic } from "../../lib/haptics.js";
import { batchResultMessage, MAX_BATCH } from "../../lib/photos.js";
import { addMediaBatch, addingLabel, progressFraction, MEDIA_ACCEPT } from "../../lib/addMedia.js";
import { looksFreshFromCamera, mediaFilename, videoMimeOf } from "../../lib/videos.js";
import {
  canSharePhoto, loadSaveToRoll, savePhotoFile, saveOutcomeMessage,
} from "../../lib/savePhoto.js";
import PhotoViewer from "../PhotoViewer.jsx";
import VideoBadge from "../VideoBadge.jsx";

const UI = "var(--font-ui)";

// The day's photos and videos: a tap-to-fill-the-screen grid plus one add
// button, behind which the OS offers the camera and the library together.
// Media added from a plant's page rides along here too, labeled with the plant.
export default function PhotosCard({ date, growId, photos = [], plants = [] }) {
  const plantName = (id) => (plants.find((p) => p.id === id)?.name || "").trim();
  const pickerRef = useRef(null);
  const [progress, setProgress] = useState(null); // {done, total, fraction, video} while uploading
  const [error, setError] = useState("");
  const [viewIndex, setViewIndex] = useState(null);
  // The shot the OS would not take on its own, waiting for a deliberate tap.
  const [rollPrompt, setRollPrompt] = useState(null);
  const [rollState, setRollState] = useState("");
  const [rollError, setRollError] = useState(null);
  useEffect(() => {
    setViewIndex(null); setError("");
    setRollPrompt(null); setRollState(""); setRollError(null);
  }, [date, growId]);

  const busy = progress !== null;

  // Each item records whether it looks freshly shot (see looksFreshFromCamera):
  // a shot taken here is not in the camera roll yet, so its viewer offers a
  // one-tap Save to Photos.
  async function uploadAll(files) {
    setError("");
    setProgress({ done: 0, total: Math.min(files.length, MAX_BATCH), fraction: null, video: false });
    const { added, failures, truncated } = await addMediaBatch(files, {
      growId, date: ymd(date), onProgress: setProgress,
    });
    if (added > 0) {
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
    }
    setError(
      truncated
        ? `Only the first ${MAX_BATCH} were added. ${batchResultMessage(added, failures)}`.trim()
        : batchResultMessage(added, failures),
    );
    setProgress(null);
  }

  // A shot taken through this app is NOT in your camera roll: the browser hands
  // the picture to the page and nowhere else. Only the OS can file it, and the
  // only way to ask is its own share sheet, which will only open while the tap
  // that produced the photo still counts as user activation.
  //
  // So the offer is made here, in the change handler, synchronously, before the
  // compressing and uploading that would spend that activation. It is as close
  // to automatic as a web app is allowed to get: the sheet appears, and the
  // grower taps Save Image. When the browser refuses, `rollPrompt` puts a
  // one-tap button on the card instead, so there is always a way through.
  const rollFilename = (file) => mediaFilename(ymd(date), videoMimeOf(file));

  function offerToRoll(file) {
    if (!canSharePhoto(file)) { setRollPrompt(file); return; }
    setRollState("saving");
    setRollError(null);
    savePhotoFile(file, rollFilename(file))
      .then((outcome) => {
        setRollState(outcome === "cancelled" ? "" : outcome);
        setRollPrompt(null);
      })
      .catch((err) => {
        // Usually the activation was spent anyway. Fall back to asking.
        setRollError(err);
        setRollState("");
        setRollPrompt(file);
      });
  }

  function onPick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    // Straight off the tap, before anything is awaited.
    if (loadSaveToRoll() && looksFreshFromCamera(files[0], files.length)) offerToRoll(files[0]);
    uploadAll(files);
  }

  // The fallback: a fresh tap, which always carries its own activation.
  function saveNow() {
    const file = rollPrompt;
    if (!file) return;
    tapHaptic();
    setRollState("saving");
    setRollError(null);
    savePhotoFile(file, rollFilename(file))
      .then((outcome) => {
        setRollState(outcome === "cancelled" ? "" : outcome);
        if (outcome !== "cancelled") setRollPrompt(null);
      })
      .catch((err) => { setRollError(err); setRollState("error"); });
  }

  const addLabel = addingLabel(progress);
  const showBar = busy && (progress.total > 1 || progress.video);

  return (
    <div>
      {photos.length > 0 && (
        <div className="card" style={{ padding: "14px 14px 15px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
            <Camera size={13} strokeWidth={2} style={{ color: "#fbbf24" }} />
            <span style={{
              fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
              color: "var(--c-text-muted)", flex: 1,
            }}>
              {photos.some((p) => p.kind === "video") ? "Photos & videos" : "Photos"}
            </span>
            <span style={{ fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)" }}>
              {photos.length}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { tapHaptic(); setViewIndex(i); }}
                aria-label={`Open ${p.kind === "video" ? "video" : "photo"} ${i + 1} of ${photos.length}`}
                className="photo-tile"
                style={{
                  padding: 0, border: "none", borderRadius: 10,
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
                {p.plantId && plantName(p.plantId) && (
                  <span style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    padding: "10px 6px 4px",
                    background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.7))",
                    fontFamily: UI, fontSize: 9.5, fontWeight: 600, color: "white",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    textAlign: "left",
                  }}>
                    {plantName(p.plantId)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* One button. The OS sheet behind it offers the camera (photo or
          video) and the library, and a library pick can be a whole batch. */}
      <button
        type="button"
        className="touch-target"
        onClick={() => { if (!busy) { tapHaptic(); pickerRef.current?.click(); } }}
        disabled={busy}
        style={{
          width: "100%", padding: "13px 12px", borderRadius: 12,
          background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)",
          color: "#fbbf24", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
          letterSpacing: 0.3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        }}>
        <ImagePlus size={15} strokeWidth={2} />
        {addLabel ?? "Add photos or videos"}
      </button>

      {showBar && (
        <div aria-hidden="true" style={{
          height: 3, borderRadius: 2, marginTop: 8, overflow: "hidden",
          background: "var(--c-border)",
        }}>
          <div style={{
            width: `${Math.round(progressFraction(progress) * 100)}%`,
            height: "100%", background: "#fbbf24", transition: "width 0.25s",
          }} />
        </div>
      )}

      {/* The browser would not open the save sheet by itself. Ask for the one
          tap that will, rather than losing the shot out of the camera roll. */}
      {rollPrompt && (
        <div style={{
          display: "flex", alignItems: "center", gap: 9, marginTop: 8,
          padding: "9px 10px 9px 12px", borderRadius: 11,
          background: "rgba(251,191,36,0.09)", border: "1px solid rgba(251,191,36,0.3)",
        }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: UI, fontSize: 11.5, color: "var(--c-text-dim)", lineHeight: 1.5 }}>
            That {videoMimeOf(rollPrompt) ? "video" : "shot"} is in your journal but not your camera roll yet.
          </span>
          <button
            type="button"
            className="touch-target"
            onClick={saveNow}
            disabled={rollState === "saving"}
            style={{
              flexShrink: 0, padding: "7px 12px", borderRadius: 9,
              background: "rgba(251,191,36,0.16)", border: "1px solid rgba(251,191,36,0.45)",
              color: "#fbbf24", fontFamily: UI, fontSize: 11.5, fontWeight: 700,
              cursor: rollState === "saving" ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 5,
            }}>
            <Download size={12} strokeWidth={2.2} />
            {rollState === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { tapHaptic(); setRollPrompt(null); setRollState(""); }}
            aria-label="Skip saving this shot to Photos"
            style={{
              flexShrink: 0, background: "none", border: "none", padding: 5,
              color: "var(--c-text-ghost)", cursor: "pointer", display: "flex",
            }}>
            <X size={13} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {saveOutcomeMessage(rollState, rollError) && (
        <div role="status" style={{
          fontFamily: UI, fontSize: 11.5, textAlign: "center", marginTop: 7, lineHeight: 1.5,
          color: rollState === "error" ? "var(--c-danger-soft)" : "var(--c-text-faint)",
        }}>
          {saveOutcomeMessage(rollState, rollError)}
        </div>
      )}

      {error && (
        <div role="status" style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", textAlign: "center", marginTop: 7, lineHeight: 1.5 }}>
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
          subtitleFor={(p) => (p.plantId ? plantName(p.plantId) : "")}
          onClose={() => setViewIndex(null)}
          onDeleted={() => { /* the journal refetch reshapes the list */ }}
        />
      )}
    </div>
  );
}
