import { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2, Download, Images } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { tapHaptic } from "../../lib/haptics.js";
import { savePhotoToDevice } from "../../lib/savePhoto.js";

const UI = "var(--font-ui)";

// Downscale an image file on-device before upload. The server caps an upload
// at 980k characters of base64; a FIXED size and quality cannot promise that,
// because how well a photo compresses depends on the picture. Dense foliage -
// exactly what this app photographs - is the worst case for JPEG and used to
// sail past the cap, which the grower saw as "too large" on every try.
//
// So: render, measure, and step down until it genuinely fits.
const MAX_UPLOAD_CHARS = 700_000;  // server allows 980k - leave real headroom
const MAX_THUMB_CHARS = 70_000;    // server allows 80k
// Progressively smaller/softer renders. The first that fits wins.
const STEPS = [[1600, 0.82], [1400, 0.75], [1200, 0.7], [1000, 0.62], [800, 0.55], [640, 0.5]];
const THUMB_STEPS = [[320, 0.7], [240, 0.6], [180, 0.5]];

export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) throw new Error("Could not read that image. Try a different photo.");

  const render = (maxEdge, quality) => {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };
  const fit = (steps, limit) => {
    let out = "";
    for (const [edge, q] of steps) {
      out = render(edge, q);
      if (out.length <= limit) return out;
    }
    return out; // smallest attempt, even if still over
  };

  try {
    const data = fit(STEPS, MAX_UPLOAD_CHARS);
    if (data.length > MAX_UPLOAD_CHARS) {
      throw new Error("That photo could not be compressed enough to upload. Try a cropped version.");
    }
    const thumb = fit(THUMB_STEPS, MAX_THUMB_CHARS);
    return { data, thumb };
  } finally {
    bitmap.close?.();
  }
}

export function Viewer({ growId, photo, onClose, onDeleted }) {
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getJournalPhoto(growId, photo.id)
      .then((d) => { if (!cancelled) setFull(d.photo?.data ?? null); })
      .catch(() => { if (!cancelled) setFull(null); });
    return () => { cancelled = true; };
  }, [growId, photo.id]);

  // Shots taken inside the app never touched the camera roll, so they get a
  // one-tap way in. Must run straight off the tap: the OS only opens its save
  // sheet during a user gesture.
  async function saveToRoll() {
    if (!full || saveState === "saving") return;
    setSaveState("saving");
    try {
      const result = await savePhotoToDevice(full, `grow-${photo.date || "photo"}.jpg`);
      setSaveState(result === "cancelled" ? "" : "saved");
    } catch {
      setSaveState("error");
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteJournalPhoto(growId, photo.id);
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
      onDeleted();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Photo"
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
      }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 8px",
      }}>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label="Delete photo"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
            borderRadius: 10, background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.4)", color: "#f87171",
            fontFamily: UI, fontSize: 12, cursor: "pointer", opacity: busy ? 0.5 : 1,
          }}>
          <Trash2 size={13} strokeWidth={2} />
          {busy ? "Deleting…" : "Delete"}
        </button>
        {photo.fromCamera && (
          <button
            type="button"
            onClick={saveToRoll}
            disabled={!full || saveState === "saving"}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
              borderRadius: 10, background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)", color: "white",
              fontFamily: UI, fontSize: 12, cursor: full ? "pointer" : "default",
              opacity: full ? 1 : 0.5,
            }}>
            <Download size={13} strokeWidth={2} />
            {saveState === "saving" ? "Saving…"
              : saveState === "saved" ? "Saved"
              : saveState === "error" ? "Try again"
              : "Save to Photos"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.1)",
            border: "none", color: "white", cursor: "pointer", display: "flex",
          }}>
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div
        onClick={onClose}
        style={{
          flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 8px calc(16px + env(safe-area-inset-bottom, 0px))",
        }}>
        {/* Thumbnail shows instantly; the full image swaps in when loaded. */}
        <img
          src={full ?? photo.thumb}
          alt="Journal photo"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }}
        />
      </div>
    </div>
  );
}

// The day's photos: a thumbnail grid plus the journal's big add action. Photos
// upload straight from the camera roll (downscaled on-device) and live on the
// day's journal page. Photos added from a plant's page ride along here too,
// labeled with the plant's name.
export default function PhotosCard({ date, growId, photos = [], plants = [] }) {
  const plantName = (id) => (plants.find((p) => p.id === id)?.name || "").trim();
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  useEffect(() => { setViewing(null); setError(""); }, [date, growId]);

  // fromCamera is recorded with the photo: a shot taken here is not in the
  // camera roll yet, so its viewer offers a one-tap Save to Photos.
  async function upload(file, fromCamera) {
    setBusy(true);
    setError("");
    try {
      const { data, thumb } = await fileToDataUrls(file);
      await api.createJournalPhoto(growId, { date: ymd(date), data, thumb, fromCamera });
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
    } catch (err) {
      setError(err?.message || "Could not add that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onPick(fromCamera) {
    return (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) upload(file, fromCamera);
    };
  }

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
              Photos
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { tapHaptic(); setViewing(p); }}
                aria-label="Open photo"
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
                {p.plantId && plantName(p.plantId) && (
                  <span style={{
                    position: "absolute", left: 0, right: 0, bottom: 0,
                    padding: "3px 5px", background: "rgba(0,0,0,0.55)",
                    fontFamily: UI, fontSize: 9, fontWeight: 600, color: "white",
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

      {/* The journal's add actions: shoot one now, or pick one you already
          have. Separate buttons so the app knows which shots are not yet in
          the camera roll. */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="touch-target"
          onClick={() => { if (!busy) { tapHaptic(); cameraRef.current?.click(); } }}
          disabled={busy}
          style={{
            flex: 1, padding: "13px 12px", borderRadius: 12,
            background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.4)",
            color: "#fbbf24", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
            letterSpacing: 0.3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          <Camera size={15} strokeWidth={2} />
          {busy ? "Adding…" : "Take photo"}
        </button>
        <button
          type="button"
          className="touch-target"
          onClick={() => { if (!busy) { tapHaptic(); libraryRef.current?.click(); } }}
          disabled={busy}
          style={{
            flex: 1, padding: "13px 12px", borderRadius: 12,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5, fontWeight: 650,
            letterSpacing: 0.3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
          <Images size={15} strokeWidth={2} />
          Choose photo
        </button>
      </div>
      {error && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", textAlign: "center", marginTop: 7, lineHeight: 1.5 }}>
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
        onChange={onPick(false)}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {viewing && (
        <Viewer
          growId={growId}
          photo={viewing}
          onClose={() => setViewing(null)}
          onDeleted={() => setViewing(null)}
        />
      )}
    </div>
  );
}
