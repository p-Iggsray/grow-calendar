import { useCallback, useEffect, useRef, useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import Portal from "./Portal.jsx";
import { qrMatrix } from "../lib/qr.js";
import { drawLabel, labelFields, LABEL_W, LABEL_H } from "../lib/growLabel.js";
import { photoFileFrom, savePhotoFile, saveOutcomeMessage } from "../lib/savePhoto.js";
import { ymd } from "../lib/api.js";
import { tapHaptic } from "../lib/haptics.js";

// A print label for a jar or a bag: six by four, landscape, black on white.
//
// What you see is exactly what is saved. The preview is the same canvas the
// file comes from, shown small, so there is no second renderer that could
// drift from the real one.
//
// The file is built as you type rather than when you tap. The OS only opens
// its save sheet while the tap is still counted as user activation, and a
// single await in front of the call spends it - the same reason the photo
// viewer prepares its file ahead of time.

const UI = "var(--font-ui)";

function Field({ label, value, onChange, placeholder, hint }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 0 }}>
      <span style={{
        fontFamily: UI, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1,
        textTransform: "uppercase", color: "var(--c-text-muted)",
      }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: "var(--c-input-bg)", color: "var(--c-text)",
          border: "1px solid var(--c-border-strong)", borderRadius: 9,
          padding: "10px 11px", fontSize: 16, fontFamily: UI, outline: "none",
          width: "100%", boxSizing: "border-box",
        }}
      />
      {hint && (
        <span style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)" }}>{hint}</span>
      )}
    </label>
  );
}

export default function StrainLabel({ strain, onClose }) {
  const canvasRef = useRef(null);
  const [netWeight, setNetWeight] = useState("");
  const [thc, setThc] = useState("");
  const [cbd, setCbd] = useState("");
  const [file, setFile] = useState(null);
  const [state, setState] = useState("");
  const [error, setError] = useState(null);

  const filename = `${(strain?.name || "strain").replace(/[^\w-]+/g, "-").toLowerCase()}-label.png`;

  // Redraw, then build the file the save button will hand over. Debounced, so
  // a fast typist is not encoding a 1800x1200 PNG on every keystroke.
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const spec = labelFields(strain, { netWeight, thc, cbd }, ymd(new Date()));
    // The code carries a link back to this strain, so scanning a jar opens its
    // page. A name too long for version 10 simply gets no code rather than a
    // broken one.
    const url = `${window.location.origin}/?strain=${encodeURIComponent(strain?.name ?? "")}`;
    drawLabel(canvas, spec, qrMatrix(url));
    setFile(null);
    canvas.toBlob((blob) => {
      if (!blob) return;
      photoFileFrom(blob, filename).then(setFile).catch(() => setFile(null));
    }, "image/png");
  }, [strain, netWeight, thc, cbd, filename]);

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
            padding: `14px 16px calc(18px + env(safe-area-inset-bottom, 0px))`,
          }}>
          <div className="sheet-handle" aria-hidden="true" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
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
          <p style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-faint)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Six by four inches, landscape, black on white at 300dpi. Saved to your
            photos so you can print it from there.
          </p>

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
              aria-label={`Label preview for ${strain?.name ?? "this strain"}`}
            />
          </div>

          <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
            <Field label="Net weight" value={netWeight} onChange={setNetWeight} placeholder="3.5 g" />
            <Field label="THC" value={thc} onChange={setThc} placeholder="22.4%" />
            <Field label="CBD" value={cbd} onChange={setCbd} placeholder="0.1%" />
          </div>
          <p style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Anything you leave blank is left off the label rather than printed empty.
            The strain, its type, the harvest date and your rating come from the app.
          </p>

          <button
            type="button"
            onClick={save}
            disabled={!file || state === "saving"}
            style={{
              width: "100%", marginTop: 14, padding: "14px", borderRadius: 12,
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
