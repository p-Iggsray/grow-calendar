import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Pencil, Trash2 } from "lucide-react";
import Portal from "./Portal.jsx";
import ScreenHeader from "./ScreenHeader.jsx";
import StrainStars from "./StrainStars.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import PhotoViewer from "./PhotoViewer.jsx";
import { tapHaptic } from "../lib/haptics.js";
import {
  FLOWER_WEEKS_MAX, FLOWER_WEEKS_MIN, NOTE_MAX, STRAIN_TYPES, strainTraits,
} from "../lib/strainLibrary.js";
import { photoUrl } from "../lib/strainPhotos.js";
import { stageLabel } from "../lib/stageTimeline.js";

const UI = "var(--font-ui)";
const PUSH_SPRING = { type: "spring", damping: 34, stiffness: 320, restDelta: 0.5 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Jun 2026" from a YYYY-MM-DD key. Month precision is the right grain here:
// what you remember about a grow is the season, not the day you popped a seed.
function fmtMonth(key) {
  const [y, m] = String(key ?? "").split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTHS[m - 1]} ${y}`;
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
        textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 7,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--c-input-bg)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 10,
  padding: "10px 12px", fontSize: 16, fontFamily: UI, outline: "none",
};

// One strain's page: what you thought of it, what the packet claimed, and
// every time you have grown it.
export default function StrainDetail({ strain, onClose, onSave, onDelete, onRename, onRenamed }) {
  const [note, setNote] = useState(strain.note ?? "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(strain.name);
  const [busy, setBusy] = useState(false);
  const [viewIndex, setViewIndex] = useState(null);
  const savedNote = useRef(strain.note ?? "");

  // What a delete would actually cost, spelled out before it happens.
  const plantCount = strain.grows.reduce((n, g) => n + g.plants, 0);
  const spaceCount = strain.grows.length;

  // The note saves when you stop typing, so there is no button to forget to
  // press and no keystroke-per-request either.
  useEffect(() => {
    if (note === savedNote.current) return;
    const t = setTimeout(async () => {
      const value = note;
      const ok = await onSave(strain.name, { note: value });
      if (ok) savedNote.current = value;
      else setError("Could not save that note. It is still here, try again in a moment.");
    }, 700);
    return () => clearTimeout(t);
  }, [note, onSave, strain.name]);

  async function set(patch) {
    const ok = await onSave(strain.name, patch);
    if (!ok) setError("Could not save that. Try again in a moment.");
  }

  return (
    <Portal>
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={PUSH_SPRING}
        style={{
          position: "fixed", inset: 0, zIndex: 70,
          background: "var(--c-bg)", overflowY: "auto",
        }}>
        <ScreenHeader
          eyebrow={strainTraits(strain) || null}
          title={strain.name}
          onBack={onClose}
          backLabel="Back to strains"
          right={
            <button
              type="button"
              className="touch-target"
              onClick={() => { tapHaptic(); set({ favorite: !strain.favorite }); }}
              aria-label={strain.favorite ? "Remove from favourites" : "Add to favourites"}
              aria-pressed={strain.favorite}
              style={{
                flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
                background: strain.favorite ? "rgba(248,113,113,0.14)" : "var(--c-surface-2)",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Heart
                size={18}
                strokeWidth={2}
                fill={strain.favorite ? "var(--c-danger)" : "none"}
                style={{ color: strain.favorite ? "var(--c-danger)" : "var(--c-text-dim)" }}
              />
            </button>
          }
        />

        <div style={{
          padding: "14px 0 calc(30px + env(safe-area-inset-bottom, 0px))",
          paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
          paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
        }}>
          <div className="card" style={{ padding: "14px 14px 4px", marginBottom: 12 }}>
            <Field label={strain.rating ? `Your rating: ${strain.rating} of 5` : "Your rating"}>
              <StrainStars value={strain.rating} onChange={(n) => set({ rating: n })} size={28} />
            </Field>
          </div>

          <div className="card" style={{ padding: "14px 14px 4px", marginBottom: 12 }}>
            <Field label="Notes">
              <textarea
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Smell, taste, how it grew, what you would do differently…"
                rows={6}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, minHeight: 120 }}
              />
            </Field>
          </div>

          {/* What the seed packet says. Facts about the strain itself, which is
              why they live on the strain rather than on any one plant. */}
          <div className="card" style={{ padding: "14px 14px 4px", marginBottom: 12 }}>
            <Field label="From the seed packet">
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {STRAIN_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="touch-target"
                    onClick={() => { tapHaptic(); set({ type: strain.type === t ? null : t }); }}
                    aria-pressed={strain.type === t}
                    style={{
                      flex: 1, padding: "9px 4px", borderRadius: 10,
                      background: strain.type === t ? "var(--c-accent)" : "var(--c-surface-1)",
                      border: `1px solid ${strain.type === t ? "var(--c-accent)" : "var(--c-border-strong)"}`,
                      color: strain.type === t ? "var(--c-bg)" : "var(--c-text-dim)",
                      fontFamily: UI, fontSize: 12.5, fontWeight: 650, cursor: "pointer",
                    }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["Photoperiod", true], ["Autoflower", false]].map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    className="touch-target"
                    onClick={() => { tapHaptic(); set({ photo: strain.photo === value ? null : value }); }}
                    aria-pressed={strain.photo === value}
                    style={{
                      flex: 1, padding: "9px 4px", borderRadius: 10,
                      background: strain.photo === value ? "var(--c-surface-2)" : "var(--c-surface-1)",
                      border: `1px solid ${strain.photo === value ? "var(--c-accent)" : "var(--c-border-strong)"}`,
                      color: strain.photo === value ? "var(--c-text)" : "var(--c-text-faint)",
                      fontFamily: UI, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: UI, fontSize: 13.5, color: "var(--c-text-dim)", flex: 1 }}>
                  Expected weeks of flower
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={FLOWER_WEEKS_MIN}
                  max={FLOWER_WEEKS_MAX}
                  value={strain.flowerWeeks ?? ""}
                  placeholder="9"
                  onChange={(e) => set({ flowerWeeks: e.target.value === "" ? null : e.target.value })}
                  style={{ ...inputStyle, width: 82, flexShrink: 0, textAlign: "center" }}
                />
              </label>
            </Field>
          </div>

          {/* What it looked like, oldest to newest: one picture from each
              stage it was photographed in, so the strip reads as the plant
              growing rather than as an album. */}
          {strain.photos?.length > 0 && (
            <div className="card" style={{ padding: "14px 0 12px", marginBottom: 12 }}>
              <div style={{
                fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
                textTransform: "uppercase", color: "var(--c-text-faint)",
                margin: "0 14px 10px",
              }}>
                How it grew
              </div>
              <div style={{
                display: "flex", gap: 8, overflowX: "auto",
                padding: "0 14px 2px", scrollSnapType: "x proximity",
              }}>
                {strain.photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { tapHaptic(); setViewIndex(i); }}
                    aria-label={`Open photo ${i + 1} of ${strain.photos.length}${p.stage ? `, ${stageLabel(p.stage)}` : ""}`}
                    style={{
                      flexShrink: 0, width: 104, padding: 0, border: "none",
                      background: "none", cursor: "pointer", scrollSnapAlign: "start",
                    }}>
                    <span style={{
                      display: "block", width: 104, height: 104, borderRadius: 11,
                      overflow: "hidden", background: "var(--c-surface-2)",
                    }}>
                      <img
                        src={photoUrl(p.id)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </span>
                    <span style={{
                      display: "block", fontFamily: UI, fontSize: 11, fontWeight: 600,
                      color: "var(--c-text-faint)", marginTop: 5, textAlign: "center",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {p.stage ? stageLabel(p.stage) : fmtMonth(p.date)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Every time you have grown it. Derived from your spaces, so it is
              always current and there is nothing here to keep up to date. */}
          <div className="card" style={{ padding: "14px 14px 12px", marginBottom: 12 }}>
            <div style={{
              fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
              textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 10,
            }}>
              {strain.growCount === 0 ? "Grow history" : `Grown ${strain.growCount === 1 ? "once" : `${strain.growCount} times`}`}
            </div>
            {strain.grows.length === 0 ? (
              <div style={{ fontFamily: UI, fontSize: 13, color: "var(--c-text-ghost)", lineHeight: 1.6 }}>
                {strain.neverGrown
                  ? "You have not grown this one yet. It is here so your notes are ready when you do."
                  : "No space holds this strain any more, but everything you wrote about it is safe."}
              </div>
            ) : strain.grows.map((g, i) => (
              <div
                key={`${g.growId}-${i}`}
                style={{
                  display: "flex", alignItems: "baseline", gap: 10, padding: "7px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--c-border-faint)",
                }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: UI, fontSize: 14, color: "var(--c-text)" }}>
                  {g.growName}
                  {g.growing > 0 && (
                    <span style={{ color: "var(--c-accent)", fontSize: 12, fontWeight: 650, marginLeft: 7 }}>
                      growing now
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-faint)", flexShrink: 0 }}>
                  {g.plants} {g.plants === 1 ? "plant" : "plants"}
                </span>
                <span style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-ghost)", flexShrink: 0, minWidth: 58, textAlign: "right" }}>
                  {fmtMonth(g.date)}
                </span>
              </div>
            ))}
          </div>

          {/* Renaming reaches every plant that carries the name, so it sits
              next to deleting rather than pretending to be a small edit. */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="touch-target"
              onClick={() => { tapHaptic(); setRenaming(true); }}
              style={{
                flex: 1, padding: "11px 12px", borderRadius: 11,
                background: "none", border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
              <Pencil size={13} strokeWidth={2} />
              Rename
            </button>
            <button
              type="button"
              className="touch-target"
              onClick={() => { tapHaptic(); setConfirmDelete(true); }}
              style={{
                flex: 1, padding: "11px 12px", borderRadius: 11,
                background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.32)",
                color: "var(--c-danger-soft)", fontFamily: UI, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}>
              <Trash2 size={13} strokeWidth={2} />
              Delete strain
            </button>
          </div>

          {error && (
            <div role="status" style={{
              fontFamily: UI, fontSize: 12, color: "var(--c-danger-soft)",
              marginTop: 12, lineHeight: 1.6, textAlign: "center",
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Say exactly what goes. A strain you have grown is not just a row in
            a list: deleting it takes the plants and their history with it. */}
        <ConfirmModal
            open={confirmDelete}
            tone="destructive"
            title={`Delete ${strain.name}?`}
            message={strain.neverGrown
              ? "It leaves your library, along with the note, rating and favourite. Nothing you have grown mentions it, so nothing else changes."
              : `Your note, rating and favourite go, and the ${plantCount} ${plantCount === 1 ? "plant" : "plants"} in ${spaceCount} ${spaceCount === 1 ? "space" : "spaces"} stop being counted as this strain. No plant is deleted: each keeps its name, its stage, its history and its photos.`}
            confirmLabel={busy ? "Deleting…" : "Delete it"}
            onConfirm={async () => {
              if (busy) return;
              setBusy(true);
              const result = await onDelete(strain.name);
              setBusy(false);
              setConfirmDelete(false);
              if (result) onClose();
              else setError("Could not delete that. Try again in a moment.");
            }}
            onCancel={() => setConfirmDelete(false)}
        />

        {/* Renaming is a real edit to the spaces, so it says so before doing it. */}
        <ConfirmModal
            open={renaming}
            title={`Rename ${strain.name}`}
            message={strain.neverGrown
              ? "Only this library entry carries the name, so nothing else changes."
              : `The ${plantCount} ${plantCount === 1 ? "plant" : "plants"} grown from it will say they are "${draftName.trim() || "…"}" instead. Their own names do not change. Rename it to something already in your library and the two become one.`}
            confirmLabel={busy ? "Renaming…" : "Rename"}
            onConfirm={async () => {
              const next = draftName.trim();
              if (!next || busy) return;
              setBusy(true);
              const result = await onRename(strain.name, next);
              setBusy(false);
              if (result) { setRenaming(false); onRenamed?.(result); }
              else setError("Could not rename that. Try again in a moment.");
            }}
            onCancel={() => { setRenaming(false); setDraftName(strain.name); }}>
          <input
            type="text"
            value={draftName}
            maxLength={60}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            aria-label="Strain name"
            style={inputStyle}
          />
        </ConfirmModal>

        {/* The strain's photos span every space it was grown in, so each one
            carries its own grow id for the viewer to fetch and delete by. */}
        {viewIndex !== null && strain.photos?.length > 0 && (
          <PhotoViewer
            photos={strain.photos.map((p) => ({ ...p, thumb: photoUrl(p.id) }))}
            startIndex={viewIndex}
            subtitleFor={(p) => (p.stage ? `${strain.name} · ${stageLabel(p.stage)}` : strain.name)}
            onClose={() => setViewIndex(null)}
          />
        )}
      </motion.div>
    </Portal>
  );
}
