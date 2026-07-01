import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Accessible confirm dialog. Focus traps between cancel and confirm buttons,
// ESC cancels, backdrop click cancels, cancel button is auto-focused on open
// (safer default), focus returns to the element that triggered the modal.
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default", // "default" | "destructive"
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      const el = returnFocusRef.current;
      if (el && typeof el.focus === "function") el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); onCancel?.(); return; }
      if (e.key !== "Tab") return;
      const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
      if (focusables.length < 2) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const titleId = "confirm-modal-title";
  const messageId = "confirm-modal-message";
  const confirmTone = tone === "destructive"
    ? { background: "rgba(220,38,38,0.18)", border: "1px solid rgba(220,38,38,0.45)", color: "var(--c-danger-soft)" }
    : { background: "rgba(34,197,94,0.18)", border: "1px solid rgba(34,197,94,0.45)", color: "var(--c-accent)" };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCancel}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={message ? messageId : undefined}
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300, restDelta: 0.5 }}
            style={{
              background: "var(--c-panel-bg)",
              border: "1px solid var(--c-border-strong)",
              borderRadius: 14,
              padding: "20px 22px 18px",
              maxWidth: 380, width: "100%",
              fontFamily: "var(--font-ui)",
              color: "var(--c-text)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}>
            <div id={titleId} style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3, marginBottom: message ? 8 : 18 }}>
              {title}
            </div>
            {message && (
              <div id={messageId} style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-dim)", marginBottom: 18 }}>
                {message}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                ref={cancelRef}
                type="button"
                className="touch-target"
                onClick={onCancel}
                style={{
                  background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
                  borderRadius: 10, padding: "8px 14px", color: "var(--c-text-dim)",
                  fontFamily: "var(--font-ui)", fontSize: 13, letterSpacing: 1,
                  cursor: "pointer",
                }}>
                {cancelLabel}
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="touch-target"
                onClick={onConfirm}
                style={{
                  ...confirmTone,
                  borderRadius: 10, padding: "8px 14px",
                  fontFamily: "var(--font-ui)", fontSize: 13, letterSpacing: 1,
                  cursor: "pointer",
                }}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
