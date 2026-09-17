import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { UI, NUM } from "./chrome.jsx";

// A grid of thumbnails. Each tile fetches its own picture from the share
// route, so a day with twenty photographs costs twenty small images that the
// browser can defer, rather than one enormous JSON payload.
export function PhotoGrid({ photos, api, onOpen, min = 92 }) {
  if (!photos?.length) return null;
  return (
    <ul style={{
      display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      gap: 6, listStyle: "none", margin: 0, padding: 0,
    }}>
      {photos.map((p, i) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}${p.date ? `, ${p.date}` : ""}`}
            style={{
              display: "block", width: "100%", aspectRatio: "1", padding: 0,
              border: "none", background: "var(--c-surface-2)", borderRadius: 10,
              overflow: "hidden", cursor: "pointer",
            }}>
            <img
              src={api.photoUrl(p.id, "thumb")}
              alt={p.plantName ? `${p.plantName}, ${p.date}` : `Photo from ${p.date}`}
              loading="lazy"
              decoding="async"
              className="photo-tile"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: 10 }}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One photograph, full size, with the rest of the set a swipe or an arrow key
 * away. Focus moves into the dialog on open and back to the tile on close, so
 * a keyboard does not get dropped behind the overlay.
 */
export function PhotoLightbox({ photos, index, api, onClose, onIndex }) {
  const panel = useRef(null);
  const restoreTo = useRef(null);
  const touchX = useRef(null);
  const photo = photos[index];

  const go = useCallback((delta) => {
    const next = index + delta;
    if (next >= 0 && next < photos.length) onIndex(next);
  }, [index, photos.length, onIndex]);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "Tab") {
        // Nothing outside this dialog is reachable while it is open.
        const focusable = panel.current?.querySelectorAll("button:not([disabled])");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [go, onClose]);

  if (!photo) return null;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${photos.length}`}
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        const to = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (from == null || to == null || Math.abs(to - from) < 48) return;
        go(to < from ? 1 : -1);
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", flexShrink: 0 }}>
        <span style={{ flex: 1, fontFamily: NUM, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          {index + 1} / {photos.length}
          {photo.date && <span style={{ marginLeft: 10, fontFamily: UI }}>{photo.date}</span>}
          {photo.plantName && <span style={{ marginLeft: 10, fontFamily: UI, color: "rgba(255,255,255,0.5)" }}>{photo.plantName}</span>}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" style={overlayBtn}>
          <X size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>
        <img
          src={api.photoUrl(photo.id, "full")}
          alt={photo.plantName ? `${photo.plantName}, ${photo.date}` : `Photo from ${photo.date}`}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, padding: "12px 0 16px", flexShrink: 0 }}>
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" style={overlayBtn}>
          <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === photos.length - 1} aria-label="Next photo" style={overlayBtn}>
          <ChevronRight size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const overlayBtn = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 42, height: 42, borderRadius: 21, flexShrink: 0,
  background: "rgba(255,255,255,0.08)", border: "none",
  color: "#fff", cursor: "pointer",
};

// The grid and its lightbox as one unit, since nowhere wants only half.
export function Photos({ photos, api, min }) {
  const [open, setOpen] = useState(null);
  if (!photos?.length) return null;
  return (
    <>
      <PhotoGrid photos={photos} api={api} onOpen={setOpen} min={min} />
      {open != null && (
        <PhotoLightbox
          photos={photos}
          index={open}
          api={api}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
