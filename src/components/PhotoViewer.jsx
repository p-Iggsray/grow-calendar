import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Download, MoreHorizontal, Play, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { photoUrl, videoUrl } from "../lib/photoUrl.js";
import { nextIndex } from "../lib/photos.js";
import { tapHaptic } from "../lib/haptics.js";
import { mediaFilename } from "../lib/videos.js";
import {
  canSharePhoto, downloadPhoto, photoFileFrom, savePhotoFile, saveOutcomeMessage,
} from "../lib/savePhoto.js";
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
// the chrome and see the whole thing. A video plays in place; only the one on
// screen is ever a real <video>, so swiping away stops it and nothing off
// screen downloads.
//
// `growId` names the space these photos came from. A set can also span several
// spaces (a strain's photos do), in which case each photo carries its own and
// that wins.
export default function PhotoViewer({ growId, photos = [], startIndex = 0, onClose, onDeleted, subtitleFor }) {
  const growOf = (p) => p?.growId ?? growId;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, photos.length - 1)));
  const [chrome, setChrome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [saveError, setSaveError] = useState(null);
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  // Full-size images, kept once fetched so swiping back is instant.
  const [fulls, setFulls] = useState({});
  // ...and each one already turned into a File, because building one takes an
  // await and an await is exactly what stops the OS save sheet from opening.
  const [files, setFiles] = useState({});
  const dragged = useRef(false);
  // A playing video owns horizontal drags: its scrubber is under the thumb,
  // and a swipe there should seek, not change the page.
  const [playing, setPlaying] = useState(false);

  const count = photos.length;
  const photo = photos[index] ?? null;
  const isVideo = (p) => p?.kind === "video";

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A delete can shrink the list under us; never point past the end.
  useEffect(() => {
    if (count > 0 && index > count - 1) setIndex(count - 1);
  }, [count, index]);

  useEffect(() => { setPlaying(false); setSaveState(""); setSaveError(null); }, [index]);

  const fetchFull = useCallback((p) => {
    const gid = p?.growId ?? growId;
    // A video's full picture is the video itself, streamed when it plays.
    if (!p || !gid || p.kind === "video") return;
    setFulls((prev) => {
      if (prev[p.id] !== undefined) return prev;   // already loaded or loading
      api.getJournalPhoto(gid, p.id)
        .then((d) => {
          const data = d.photo?.data ?? null;
          setFulls((cur) => ({ ...cur, [p.id]: data }));
          // Build the File now, while nobody is waiting on it. By the time the
          // grower taps Save to Photos it has to be ready to hand over on the
          // spot, with no await between the tap and navigator.share.
          if (data) {
            photoFileFrom(data, `grow-${p.date || "photo"}.jpg`)
              .then((file) => setFiles((cur) => ({ ...cur, [p.id]: file })))
              .catch(() => { /* the menu item stays disabled */ });
          }
        })
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

  // Shots taken inside the app never touched the camera roll, so they get a
  // one-tap way in.
  //
  // Deliberately NOT async. The OS only opens its save sheet while the tap that
  // asked for it is still counted as user activation, and a single await in
  // front of the call spends that. The File was built when the picture loaded
  // precisely so there is nothing to wait for here.
  function saveToRoll() {
    const file = files[photo?.id];
    if (isVideo(photo) && !file) { prepareVideo(photo); return; }
    if (!file || saveState === "saving") return;
    setSaveState("saving");
    setSaveError(null);
    savePhotoFile(file, mediaFilename(photo.date, photo.mime))
      .then((outcome) => setSaveState(outcome === "cancelled" ? "" : outcome))
      .catch((err) => { setSaveError(err); setSaveState("error"); });
  }

  // A video is not fetched ahead of time the way a photo is: it can be a
  // hundred megabytes, and most videos opened here are only watched. So the
  // first tap fetches it, and by the time it has arrived the tap's activation
  // is long spent, which means the OS sheet needs a second one. A device that
  // cannot share files needs no sheet, so it just downloads.
  function prepareVideo(p) {
    if (saveState === "preparing") return;
    setSaveState("preparing");
    setSaveError(null);
    photoFileFrom(videoUrl(p.id), mediaFilename(p.date, p.mime))
      .then((file) => {
        setFiles((cur) => ({ ...cur, [p.id]: file }));
        if (canSharePhoto(file)) { setSaveState("ready"); return; }
        setSaveState(downloadPhoto(file));
      })
      .catch((err) => { setSaveError(err); setSaveState("error"); });
  }

  async function remove() {
    if (busy || !photo || !growOf(photo)) return;
    setBusy(true);
    try {
      await api.deleteJournalPhoto(growOf(photo), photo.id);
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

  const status = saveOutcomeMessage(saveState, saveError);
  const subtitle = subtitleFor?.(photo) || "";
  const fileReady = Boolean(files[photo.id]);
  const video = isVideo(photo);
  const noun = video ? "video" : "photo";
  // A photo's file is built as it loads; a video's is fetched on the first tap.
  const saveLabel = saveState === "preparing"
    ? "Preparing video…"
    : fileReady || video ? "Save to Photos" : "Save to Photos (loading…)";

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
          drag={count > 1 && !playing ? "x" : false}
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
              {isVideo(p) && p.id === photo.id ? (
                <video
                  key={p.id}
                  src={videoUrl(p.id)}
                  poster={photoUrl(p.id)}
                  controls
                  playsInline
                  preload="metadata"
                  onClick={(e) => e.stopPropagation()}
                  onPlay={() => { setPlaying(true); setChrome(false); }}
                  onPause={() => { setPlaying(false); setChrome(true); }}
                  onEnded={() => { setPlaying(false); setChrome(true); }}
                  style={{ maxWidth: "100%", maxHeight: "100%", display: "block", background: "#000" }}
                />
              ) : (
                <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", display: "flex" }}>
                  {/* The thumbnail holds the frame until the full image arrives. */}
                  <img
                    src={fulls[p.id] || p.thumb || photoUrl(p.id)}
                    alt=""
                    draggable={false}
                    style={{
                      maxWidth: "100%", maxHeight: "100%",
                      objectFit: "contain", display: "block",
                      userSelect: "none", WebkitUserSelect: "none",
                    }}
                  />
                  {isVideo(p) && (
                    <span aria-hidden="true" style={{
                      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                      width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.55)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}>
                      <Play size={28} strokeWidth={0} fill="currentColor" style={{ marginLeft: 4 }} />
                    </span>
                  )}
                </div>
              )}
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
                    title={video ? "Video" : "Photo"}
                    label={video ? "Video actions" : "Photo actions"}
                    icon={MoreHorizontal}
                    buttonStyle={{
                      background: "rgba(255,255,255,0.15)",
                      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                      color: "#fff",
                    }}
                    items={[
                      {
                        icon: Download,
                        label: saveLabel,
                        detail: `Adds this ${video ? "video" : "shot"} to your camera roll`,
                        onClick: saveToRoll,
                        disabled: (!fileReady && !video) || saveState === "saving" || saveState === "preparing",
                      },
                      { icon: Trash2, label: busy ? "Deleting…" : `Delete ${noun}`, tone: "destructive", onClick: remove, disabled: busy },
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
