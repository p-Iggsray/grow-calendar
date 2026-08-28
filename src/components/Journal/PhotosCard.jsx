import { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2 } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { tapHaptic } from "../../lib/haptics.js";

const UI = "var(--font-ui)";

// Downscale an image file on-device before upload: a main image capped at
// 1600px (JPEG) and a small square-ish thumbnail for grids. Keeps every photo
// well under the server's size cap regardless of what the camera produced.
// Shared with the per-plant photo section.
export async function fileToDataUrls(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    .catch(() => createImageBitmap(file))
    .catch(() => null);
  if (!bitmap) throw new Error("Could not read that image.");
  const scale = (maxEdge, quality) => {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * ratio));
    const h = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  };
  const result = { data: scale(1600, 0.82), thumb: scale(320, 0.7) };
  bitmap.close?.();
  return result;
}

export function Viewer({ growId, photo, onClose, onDeleted }) {
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getJournalPhoto(growId, photo.id)
      .then((d) => { if (!cancelled) setFull(d.photo?.data ?? null); })
      .catch(() => { if (!cancelled) setFull(null); });
    return () => { cancelled = true; };
  }, [growId, photo.id]);

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
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);
  useEffect(() => { setViewing(null); setError(""); }, [date, growId]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { data, thumb } = await fileToDataUrls(file);
      await api.createJournalPhoto(growId, { date: ymd(date), data, thumb });
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
    } catch (err) {
      setError(err?.message || "Could not add that photo. Try again.");
    } finally {
      setBusy(false);
    }
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

      {/* The journal's add action: put a photo on this day's page. */}
      <button
        type="button"
        className="touch-target"
        onClick={() => { if (!busy) { tapHaptic(); inputRef.current?.click(); } }}
        disabled={busy}
        style={{
          width: "100%", padding: "13px 14px", borderRadius: 12,
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
          color: "#fbbf24", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
          letterSpacing: 0.4, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
        <Camera size={15} strokeWidth={2} />
        {busy ? "Adding photo…" : "Add a photo to this day"}
      </button>
      {error && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", textAlign: "center", marginTop: 7, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
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
