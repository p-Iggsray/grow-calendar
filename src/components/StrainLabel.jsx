import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Loader2, Plus, Trash2 } from "lucide-react";
import Portal from "./Portal.jsx";
import { qrMatrix } from "../lib/qr.js";
import { drawLabel, labelDraft, labelFields, LABEL_W, LABEL_H } from "../lib/growLabel.js";
import { photoFileFrom, savePhotoFile, saveOutcomeMessage } from "../lib/savePhoto.js";
import { ymd } from "../lib/api.js";
import { strainPagePath } from "../lib/strainPage.js";
import { tapHaptic } from "../lib/haptics.js";

// A print label for the jar a plant ends up in.
//
// Everything on it is editable. The app fills in what it knows - the name, the
// classification, the harvest date, the space it grew in - and then gets out of
// the way, because a label is a claim about one specific jar and only the
// person holding it knows the weight, the potency or the day it was packed.
//
// The code opens a public page about the strain itself - what the variety is,
// how it grows, what it tastes of - and nothing about you. Hand somebody a jar
// and they can read about the plant; they cannot read your grow.
//
// The picker below chooses which harvest this jar came from, which decides the
// space named on the label. It no longer steers the code.
//
// What you see is exactly what is saved: the preview is the same canvas the
// file comes from. The file is built as you type rather than when you tap,
// because the OS only opens its save sheet while the tap still counts as user
// activation, and a single await in front of the call spends it.

const UI = "var(--font-ui)";

const inputStyle = {
  background: "var(--c-input-bg)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 9,
  padding: "10px 11px", fontSize: 16, fontFamily: UI, outline: "none",
  width: "100%", boxSizing: "border-box",
};
const labelStyle = {
  fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1,
  textTransform: "uppercase", color: "var(--c-text-muted)",
};

function Field({ label, value, onChange, placeholder, flex = 1 }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
}

export default function StrainLabel({ strain, onClose }) {
  const canvasRef = useRef(null);
  const roster = useMemo(
    () => (strain?.roster ?? []).filter((p) => p?.id),
    [strain],
  );
  // Which plant this jar came from. The code, and the space named on the
  // label, both follow it.
  const [plantId, setPlantId] = useState(() => roster[roster.length - 1]?.id ?? null);
  const plant = roster.find((p) => p.id === plantId) ?? roster[roster.length - 1] ?? null;

  const [draft, setDraft] = useState(() => labelDraft(strain, plant, ymd(new Date())));
  const [file, setFile] = useState(null);
  const [state, setState] = useState("");
  const [error, setError] = useState(null);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const setTerp = (i, k, v) => setDraft((d) => {
    const terpenes = [...(d.terpenes ?? [])];
    terpenes[i] = { ...terpenes[i], [k]: v };
    return { ...d, terpenes };
  });
  const addTerp = () => setDraft((d) => ({ ...d, terpenes: [...(d.terpenes ?? []), { name: "", pct: "" }] }));
  const removeTerp = (i) => setDraft((d) => {
    const terpenes = [...(d.terpenes ?? [])];
    terpenes.splice(i, 1);
    return { ...d, terpenes };
  });

  // Switching plant refreshes only what the plant decides, so anything already
  // typed by hand survives the change.
  useEffect(() => {
    if (!plant) return;
    setDraft((d) => ({ ...d, grownIn: plant.growName ?? d.grownIn }));
  }, [plant]);

  const filename = `${(draft.name || "label").replace(/[^\w-]+/g, "-").toLowerCase()}-label.png`;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const spec = labelFields(draft);
    // The code opens a public page about the strain itself: what the variety
    // is, how it grows, what it tastes of. Not this jar, and not your records -
    // hand somebody a jar and they can read about the plant, not about you.
    const slug = strainPagePath(draft.name);
    const link = slug ? `${window.location.origin}${slug}` : window.location.origin;
    drawLabel(canvas, spec, qrMatrix(link));
    setFile(null);
    canvas.toBlob((blob) => {
      if (!blob) return;
      photoFileFrom(blob, filename).then(setFile).catch(() => setFile(null));
    }, "image/png");
  }, [draft, filename]);

  useEffect(() => {
    const t = setTimeout(render, 180);
    return () => clearTimeout(t);
  }, [render]);

  // Deliberately not async: see the note at the top.
  function save() {
    if (!file || state === "saving") return;
    tapHaptic();
    setState("saving");
    setError(null);
    savePhotoFile(file, filename)
      .then((outcome) => setState(outcome === "cancelled" ? "" : outcome))
      .catch((err) => { setError(err); setState("error"); });
  }

  const message = saveOutcomeMessage(state, error);
  const terpenes = draft.terpenes ?? [];

  return (
    <Portal>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Print label"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto",
            background: "var(--c-panel-bg)", border: "1px solid var(--c-border-strong)",
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: "14px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
          }}>
          <div className="sheet-handle" aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ flex: 1, fontFamily: UI, fontSize: 17, fontWeight: 750, color: "var(--c-text)" }}>
              Print label
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--c-surface-2)", border: "none", borderRadius: 9,
                width: 34, height: 34, cursor: "pointer", color: "var(--c-text-dim)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          {/* The preview IS the file. */}
          <div style={{
            background: "#fff", borderRadius: 10, overflow: "hidden",
            border: "1px solid var(--c-border-strong)", lineHeight: 0,
          }}>
            <canvas
              ref={canvasRef}
              width={LABEL_W}
              height={LABEL_H}
              style={{ width: "100%", height: "auto", display: "block" }}
              aria-label={`Label preview for ${draft.name || "this strain"}`}
            />
          </div>

          {/* Which plant this jar holds. The code follows this choice. */}
          {roster.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <span style={{ ...labelStyle, display: "block", marginBottom: 6 }}>Which harvest this jar came from</span>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {roster.map((p) => {
                  const on = p.id === plantId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { tapHaptic(); setPlantId(p.id); }}
                      aria-pressed={on}
                      style={{
                        padding: "8px 12px", borderRadius: 14, cursor: "pointer",
                        background: on ? "rgba(var(--c-accent-rgb), 0.16)" : "var(--c-surface-1)",
                        border: `1px solid ${on ? "rgba(var(--c-accent-rgb), 0.5)" : "var(--c-border-strong)"}`,
                        color: on ? "var(--c-accent)" : "var(--c-text-muted)",
                        fontFamily: UI, fontSize: 12, fontWeight: on ? 700 : 500,
                      }}>
                      {p.name || "Unnamed"}
                      <span style={{ opacity: 0.7 }}>{`  ·  ${p.growName}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
            <Field label="Strain name" value={draft.name} onChange={(v) => set("name", v)} placeholder="Blue Dream" />
            <Field label="Classification" value={draft.classification} onChange={(v) => set("classification", v)} placeholder="Hybrid · Photoperiod · Cannabis" />
            <div style={{ display: "flex", gap: 9 }}>
              <Field label="Net weight" value={draft.netWeight} onChange={(v) => set("netWeight", v)} placeholder="3.5 g" />
              <Field label="THC" value={draft.thc} onChange={(v) => set("thc", v)} placeholder="22.4%" />
              <Field label="CBD" value={draft.cbd} onChange={(v) => set("cbd", v)} placeholder="0.1%" />
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <Field label="Harvested" value={draft.harvested} onChange={(v) => set("harvested", v)} placeholder="6 Sep 2026" />
              <Field label="Packaged" value={draft.packaged} onChange={(v) => set("packaged", v)} placeholder="8 Sep 2026" />
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <Field label="Grown in" value={draft.grownIn} onChange={(v) => set("grownIn", v)} placeholder="Tent One" />
              <Field label="Batch / lot" value={draft.batch} onChange={(v) => set("batch", v)} placeholder="BD-260908" />
            </div>

            {/* Terpenes, as many as the label has room for. */}
            <div>
              <span style={{ ...labelStyle, display: "block", marginBottom: 6 }}>Terpenes</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {terpenes.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <input
                      value={t.name ?? ""}
                      onChange={(e) => setTerp(i, "name", e.target.value)}
                      placeholder="Myrcene"
                      style={{ ...inputStyle, flex: 2 }}
                      aria-label={`Terpene ${i + 1} name`}
                    />
                    <input
                      value={t.pct ?? ""}
                      onChange={(e) => setTerp(i, "pct", e.target.value)}
                      placeholder="0.8%"
                      style={{ ...inputStyle, flex: 1 }}
                      aria-label={`Terpene ${i + 1} percentage`}
                    />
                    <button
                      type="button"
                      onClick={() => removeTerp(i)}
                      aria-label={`Remove terpene ${i + 1}`}
                      style={{
                        background: "none", border: "1px solid var(--c-border)", borderRadius: 8,
                        color: "var(--c-text-ghost)", cursor: "pointer", padding: 8, flexShrink: 0,
                      }}>
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                {terpenes.length < 6 && (
                  <button
                    type="button"
                    onClick={addTerp}
                    style={{
                      padding: "10px", borderRadius: 9, cursor: "pointer",
                      background: "none", border: "1px dashed var(--c-border-strong)",
                      color: "var(--c-text-ghost)", fontFamily: UI, fontSize: 11.5,
                      fontWeight: 600, letterSpacing: 0.6,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                    <Plus size={12} strokeWidth={2.5} />
                    ADD A TERPENE
                  </button>
                )}
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelStyle}>Note along the foot</span>
              <textarea
                value={draft.note}
                onChange={(e) => set("note", e.target.value)}
                rows={2}
                placeholder="Sweet berry nose, heavy yield."
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
            </label>
          </div>

          <p style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Anything left blank is left off the label rather than printed empty.
            Six by four inches, landscape, black on white at 300dpi.
          </p>

          <button
            type="button"
            onClick={save}
            disabled={!file || state === "saving"}
            style={{
              width: "100%", marginTop: 13, padding: "14px", borderRadius: 12,
              background: file ? "var(--c-accent)" : "var(--c-surface-2)",
              border: "none", cursor: file ? "pointer" : "default",
              color: file ? "#04220f" : "var(--c-text-ghost)",
              fontFamily: UI, fontSize: 14, fontWeight: 750,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {state === "saving"
              ? <Loader2 size={16} strokeWidth={2.4} className="spin" />
              : <Download size={16} strokeWidth={2.4} />}
            {file ? "Save to Photos" : "Preparing…"}
          </button>
          {message && (
            <p style={{
              fontFamily: UI, fontSize: 12, textAlign: "center", margin: "9px 0 0",
              color: state === "error" ? "var(--c-danger-soft)" : "var(--c-text-faint)",
            }}>
              {message}
            </p>
          )}
        </div>
      </div>
    </Portal>
  );
}
