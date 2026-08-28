import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { fileToDataUrls, Viewer } from "../Journal/PhotosCard.jsx";
import { fmtDateKey, MONO } from "./constants.js";
import { tapHaptic } from "../../lib/haptics.js";

// One plant's photo timeline: newest first, uploaded from the plant's page.
// Each photo is dated today and shows up on that day's journal page too,
// labeled with this plant.
export default function PlantPhotos({ growId, plantId }) {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(null);

  const load = () => {
    api.listPlantPhotos(growId, plantId)
      .then((d) => setPhotos(d.photos ?? []))
      .catch(() => setPhotos([]));
  };
  useEffect(load, [growId, plantId]);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { data, thumb } = await fileToDataUrls(file);
      await api.createJournalPhoto(growId, { date: ymd(new Date()), data, thumb, plantId });
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
      load();
    } catch (err) {
      setError(err?.message || "Could not add that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
          Photos
        </span>
        <button
          type="button"
          onClick={() => { if (!busy) { tapHaptic(); inputRef.current?.click(); } }}
          disabled={busy}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 18, padding: "7px 14px", color: "#fbbf24",
            fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}>
          <Camera size={13} strokeWidth={2} />
          {busy ? "Adding…" : "Add photo"}
        </button>
      </div>

      {photos.length === 0 && !busy && (
        <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "4px 0" }}>
          No photos of this plant yet.
        </div>
      )}

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { tapHaptic(); setViewing(p); }}
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
          onDeleted={() => { setViewing(null); load(); }}
        />
      )}
    </div>
  );
}
