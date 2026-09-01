import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Download, MoreHorizontal, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { nextIndex } from "../lib/photos.js";
import { tapHaptic } from "../lib/haptics.js";
import { savePhotoToDevice } from "../lib/savePhoto.js";
import Portal from "./Portal.jsx";
import HeaderMenu from "./HeaderMenu.jsx";

const UI = "var(--font-ui)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtPhotoDate(key) {
  const [y, m, d] = (key || "").split("-").map(Number);
  if (!y || !m || !d) return "Photo";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// The photo, full bleed on black, with everything else floating on top of it.
// Swipe (or arrow-key) between every photo in the set, tap the picture to hide
// the chrome and see the whole thing.
export default function PhotoViewer({ growId, photos = [], startIndex = 0, onClose, onDeleted, subtitleFor }) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, photos.length - 1)));
  const [chrome, setChrome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  // Full-size images, kept once fetched so swiping back is instant.
  const [fulls, setFulls] = useState({});
  const dragged = useRef(false);

  const count = photos.length;
  const photo = photos[index] ?? null;

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A delete can shrink the list under us; never point past the end.
  useEffect(() => {
    if (count > 0 && index > count - 1) setIndex(count - 1);
  }, [count, index]);

  const fetchFull = useCallback((p) => {
    if (!p) return;
    setFulls((prev) => {
      if (prev[p.id] !== undefined) return prev;   // already loaded or loading
      api.getJournalPhoto(growId, p.id)
        .then((d) => setFulls((cur) => ({ ...cur, [p.id]: d.photo?.data ?? null })))
        .catch(() => setFulls((cur) => ({ ...cur, [p.id]: null })));
      return { ...prev, [p.id]: undefined };
    });
  }, [growId]);

  // The one you are looking at, plus its neighbours so a swipe lands on a
  // sharp picture rather than a thumbnail that sharpens a moment later.
  useEffect(() => {
    for (const i of [index, index + 1, index - 1]) {
      if (i >= 0 && i < count) fetchFull(photos[i]);
    }
  }, [index, count, photos, fetchFull]);

  const go = useCallback((next) => {
    setIndex((cur) => {
      const clamped = Math.min(count - 1, Math.max(0, next));
      if (clamped !== cur) tapHaptic();
      return clamped;
    });
  }, [count]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); go(index - 1); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, go, onClose]);

  const full = photo ? fulls[photo.id] : null;

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
    if (busy || !photo) return;
    setBusy(true);
    try {
      await api.deleteJournalPhoto(growId, photo.id);
      tapHaptic();
      window.dispatchEvent(new CustomEvent("journal-mutated"));
      onDeleted?.(photo.id);
      // Last one gone: nothing left to look at.
      if (count <= 1) onClose();
    } catch {
      setBusy(false);
    }
  }

  if (!photo) return null;

  const status =
    saveState === "saving" ? "Opening your phone's save sheet…" :
    saveState === "saved"  ? "Sent to your photos." :
    saveState === "error"  ? "Could not save that photo. Try again." : "";
  const subtitle = subtitleFor?.(photo) || "";

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Photo ${index + 1} of ${count}`}
        style={{
          position: "fixed", inset: 0, zIndex: 70,
          background: "#000",
          overflow: "hidden",
          // The picture is the screen. Nothing here scrolls.
          touchAction: "none",
        }}>

        {/* The strip of every photo in the set, slid one screen at a time. */}
        <motion.div
          drag={count > 1 ? "x" : false}
          dragElastic={0.14}
          dragConstraints={{ left: -(count - 1) * width, right: 0 }}
          dragMomentum={false}
          onDragStart={() => { dragged.current = true; }}
          onDragEnd={(_e, info) => {
            go(nextIndex(index, count, info.offset.x, info.velocity.x));
            // Let the click that follows this drag through to nothing.
            setTimeout(() => { dragged.current = false; }, 0);
          }}
          animate={{ x: -index * width }}
          transition={{ type: "spring", damping: 34, stiffness: 320, restDelta: 0.5 }}
          style={{ display: "flex", height: "100%", width: count * width }}>
          {photos.map((p) => (
            <div
              key={p.id}
              onClick={() => { if (!dragged.current) setChrome((c) => !c); }}
              style={{
                width, height: "100%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {/* The thumbnail holds the frame until the full image arrives. */}
              <img
                src={fulls[p.id] || p.thumb}
                alt=""
                draggable={false}
                style={{
                  maxWidth: "100%", maxHeight: "100%",
                  objectFit: "contain", display: "block",
                  userSelect: "none", WebkitUserSelect: "none",
                }}
              />
            </div>
          ))}
        </motion.div>

        {/* Chrome. Floats over the picture and gets out of the way on a tap. */}
        <AnimatePresence>
          {chrome && (
            <>
              <motion.div
                key="top"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                style={{
                  position: "absolute", top: 0, left: 0, right: 0,
                  padding: "calc(10px + env(safe-area-inset-top, 0px)) 12px 26px",
                  background: "linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0))",
                  display: "flex", alignItems: "center", gap: 12,
                  pointerEvents: "none",
                }}>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close photo"
                  style={{
                    pointerEvents: "auto",
                    flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                    border: "none", color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  <ChevronLeft size={20} strokeWidth={2.4} style={{ marginLeft: -2 }} />
                </button>

                <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                  <div style={{ fontFamily: UI, fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {count > 1 ? `${index + 1} of ${count}` : fmtPhotoDate(photo.date)}
                  </div>
                  {count > 1 && (
                    <div style={{ fontFamily: UI, fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 1 }}>
                      {fmtPhotoDate(photo.date)}
                    </div>
                  )}
                </div>

                <div style={{ pointerEvents: "auto", flexShrink: 0 }}>
                  <HeaderMenu
                    title="Photo"
                    label="Photo actions"
                    icon={MoreHorizontal}
                    buttonStyle={{
                      background: "rgba(255,255,255,0.15)",
                      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                      color: "#fff",
                    }}
                    items={[
                      photo.fromCamera && {
                        icon: Download,
                        label: "Save to Photos",
                        detail: "Adds this shot to your camera roll",
                        onClick: saveToRoll,
                        disabled: !full || saveState === "saving",
                      },
                      { icon: Trash2, label: busy ? "Deleting…" : "Delete photo", tone: "destructive", onClick: remove, disabled: busy },
                    ]}
                  />
                </div>
              </motion.div>

              {(status || subtitle || count > 1) && (
                <motion.div
                  key="bottom"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: "26px 16px calc(14px + env(safe-area-inset-bottom, 0px))",
                    background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.62))",
                    textAlign: "center", pointerEvents: "none",
                  }}>
                  {subtitle && (
                    <div style={{ fontFamily: UI, fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
                      {subtitle}
                    </div>
                  )}
                  {status && (
                    <div style={{
                      fontFamily: UI, fontSize: 12, marginBottom: 8,
                      color: saveState === "error" ? "#fca5a5" : "rgba(255,255,255,0.85)",
                    }}>
                      {status}
                    </div>
                  )}
                  {/* Dots, while there are few enough for them to mean anything. */}
                  {count > 1 && count <= 12 && (
                    <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                      {photos.map((p, i) => (
                        <span key={p.id} style={{
                          width: i === index ? 7 : 6, height: i === index ? 7 : 6, borderRadius: 4,
                          background: i === index ? "#fff" : "rgba(255,255,255,0.4)",
                          transition: "background 0.15s",
                        }} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )}
        </AnimatePresence>
      </div>
    </Portal>
  );
}
