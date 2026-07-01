import { useState, useRef, useEffect } from "react";

export function TaskEditSheet({ currentText, onSave, onClose }) {
  const [text, setText] = useState(currentText);
  const [kbOffset, setKbOffset] = useState(0);
  const textareaRef = useRef(null);

  // Track keyboard height via Visual Viewport API so the sheet always sits
  // flush above the keyboard on iOS and Android.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
    const len = currentText.length;
    textareaRef.current?.setSelectionRange(len, len);
  }, [currentText]);

  const isDirty = text.trim() && text.trim() !== currentText.trim();
  // When the keyboard is up, safe-area-inset-bottom is 0, so use flat padding.
  const bottomPad = kbOffset > 0 ? "20px" : "calc(24px + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: kbOffset, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
        boxShadow: "var(--shadow-sheet)",
        padding: `8px 20px ${bottomPad}`,
      }}>
        <div className="sheet-handle" />
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 1.5, color: "var(--c-text-muted)", textTransform: "uppercase", margin: "10px 0 12px" }}>
          Edit task text
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          style={{
            width: "100%", resize: "none", boxSizing: "border-box",
            background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
            border: "1px solid var(--c-border-strong)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, lineHeight: 1.7,
            fontFamily: "var(--font-ui)", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12,
              background: "var(--c-surface-1)", border: "1px solid var(--c-surface-2)",
              color: "var(--c-text-dim)", cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => isDirty && onSave(text.trim())}
            style={{
              flex: 2, padding: "14px 0", borderRadius: 12,
              background: "var(--c-accent)", border: "none",
              color: "#000", cursor: "pointer", fontSize: 14, fontWeight: 700,
              opacity: isDirty ? 1 : 0.4,
            }}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}
