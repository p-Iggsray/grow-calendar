import { useRef, useState } from "react";
import { motion } from "framer-motion";
import Portal from "./Portal.jsx";
import { tapHaptic } from "../lib/haptics.js";
import {
  FLOWER_WEEKS_MAX, FLOWER_WEEKS_MIN, STRAIN_TYPES, strainNameKey,
} from "../lib/strainLibrary.js";

const UI = "var(--font-ui)";

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--c-input-bg)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 10,
  padding: "11px 12px", fontSize: 16, fontFamily: UI, outline: "none",
};

const labelStyle = {
  fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
  textTransform: "uppercase", color: "var(--c-text-faint)",
  display: "block", marginBottom: 7,
};

// Adding a strain by hand, off the seed packet, before you have grown it.
//
// The fields are exactly what a packet tells you: the name, whether it is
// indica, sativa or hybrid, whether it flowers on a timer or on a light
// schedule, and how many weeks of flower the breeder claims. Only the name is
// required, because a packet that says nothing else is still a strain.
export default function AddStrainSheet({ onAdd, onClose, existingKeys = [] }) {
  const [name, setName] = useState("");
  const [type, setType] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [flowerWeeks, setFlowerWeeks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef(null);

  const key = strainNameKey(name);
  const duplicate = key && existingKeys.includes(key);

  async function submit() {
    if (!key || busy) return;
    if (duplicate) {
      setError("That one is already in your library. Close this and open it from the list.");
      return;
    }
    setBusy(true);
    setError("");
    const ok = await onAdd({
      name: name.trim(),
      type,
      photo,
      flowerWeeks: flowerWeeks === "" ? null : flowerWeeks,
    });
    if (!ok) { setError("Could not add that strain. Try again in a moment."); setBusy(false); }
  }

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 95,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end",
        }}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Add a strain"
          onClick={(e) => e.stopPropagation()}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300, restDelta: 0.5 }}
          onAnimationComplete={() => nameRef.current?.focus()}
          style={{
            width: "100%", maxHeight: "88vh", overflowY: "auto",
            background: "var(--c-panel-bg)",
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            border: "1px solid var(--c-border-strong)", borderBottom: "none",
            padding: "8px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
          }}>
          <div aria-hidden="true" style={{
            width: 38, height: 4, borderRadius: 2, margin: "4px auto 14px",
            background: "var(--c-border-strong)",
          }} />

          <div style={{ fontFamily: UI, fontSize: 17, fontWeight: 800, color: "var(--c-text)", marginBottom: 5 }}>
            Add a strain
          </div>
          <p style={{ fontFamily: UI, fontSize: 12.5, lineHeight: 1.65, color: "var(--c-text-muted)", margin: "0 0 16px" }}>
            Straight off the packet, before it goes in the ground. Strains you
            name on a plant turn up here on their own.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="add-strain-name">Name</label>
            <input
              id="add-strain-name"
              ref={nameRef}
              type="text"
              value={name}
              maxLength={60}
              placeholder="Blue Dream"
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              style={inputStyle}
            />
            {duplicate && (
              <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-warn)", marginTop: 6 }}>
                Already in your library.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={labelStyle}>Type</span>
            <div style={{ display: "flex", gap: 8 }}>
              {STRAIN_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="touch-target"
                  onClick={() => { tapHaptic(); setType(type === t ? null : t); }}
                  aria-pressed={type === t}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: 10,
                    background: type === t ? "var(--c-accent)" : "var(--c-surface-1)",
                    border: `1px solid ${type === t ? "var(--c-accent)" : "var(--c-border-strong)"}`,
                    color: type === t ? "var(--c-bg)" : "var(--c-text-dim)",
                    fontFamily: UI, fontSize: 12.5, fontWeight: 650, cursor: "pointer",
                  }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={labelStyle}>Flowers on</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[["A light schedule", true], ["Its own timer", false]].map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  className="touch-target"
                  onClick={() => { tapHaptic(); setPhoto(photo === value ? null : value); }}
                  aria-pressed={photo === value}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: 10,
                    background: photo === value ? "var(--c-surface-2)" : "var(--c-surface-1)",
                    border: `1px solid ${photo === value ? "var(--c-accent)" : "var(--c-border-strong)"}`,
                    color: photo === value ? "var(--c-text)" : "var(--c-text-faint)",
                    fontFamily: UI, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-ghost)", marginTop: 6 }}>
              Photoperiod or autoflower, whichever the packet says.
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle} htmlFor="add-strain-weeks">Expected weeks of flower</label>
            <input
              id="add-strain-weeks"
              type="number"
              inputMode="numeric"
              min={FLOWER_WEEKS_MIN}
              max={FLOWER_WEEKS_MAX}
              value={flowerWeeks}
              placeholder="9"
              onChange={(e) => setFlowerWeeks(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              style={{ ...inputStyle, width: 110 }}
            />
            <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-ghost)", marginTop: 6 }}>
              What the breeder claims on the packaging. Leave it blank if it does not say.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="touch-target"
              onClick={onClose}
              style={{
                flex: 1, padding: "12px", borderRadius: 11,
                background: "none", border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-muted)", fontFamily: UI, fontSize: 13, cursor: "pointer",
              }}>
              Cancel
            </button>
            <button
              type="button"
              className="touch-target"
              onClick={submit}
              disabled={!key || busy || duplicate}
              style={{
                flex: 2, padding: "12px", borderRadius: 11,
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)",
                color: "var(--c-accent)", fontFamily: UI, fontSize: 13.5, fontWeight: 700,
                cursor: !key || busy || duplicate ? "default" : "pointer",
                opacity: !key || busy || duplicate ? 0.45 : 1,
              }}>
              {busy ? "Adding…" : "Add to my library"}
            </button>
          </div>

          {error && (
            <div role="status" style={{
              fontFamily: UI, fontSize: 12, color: "var(--c-danger-soft)",
              marginTop: 12, lineHeight: 1.6,
            }}>
              {error}
            </div>
          )}
        </motion.div>
      </motion.div>
    </Portal>
  );
}
