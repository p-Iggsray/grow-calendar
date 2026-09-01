import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Settings } from "lucide-react";
import { tapHaptic } from "../lib/haptics.js";
import Portal from "./Portal.jsx";

const UI = "var(--font-ui)";

// The gear that lives in a screen header's right slot. Tapping it raises a
// sheet of that screen's own actions, which keeps settings and destructive
// choices off the page body.
//
// items: [{ icon, label, detail, onClick, tone }] - tone "destructive" for
// deletes. A falsy entry is skipped, so callers can inline conditions.
//
// `icon` and `buttonStyle` let a screen that is not a settings screen borrow
// the same sheet - the photo viewer uses a "..." over the picture.
export default function HeaderMenu({
  items = [], title = "Settings", label = "Settings",
  icon: TriggerIcon = Settings, buttonStyle,
}) {
  const [open, setOpen] = useState(false);
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;

  function pick(item) {
    setOpen(false);
    tapHaptic();
    item.onClick?.();
  }

  return (
    <>
      <button
        type="button"
        className="touch-target"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { tapHaptic(); setOpen(true); }}
        style={{
          flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
          background: "var(--c-surface-2)", border: "none",
          color: "var(--c-text)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          ...buttonStyle,
        }}>
        <TriggerIcon size={19} strokeWidth={2} />
      </button>

      <AnimatePresence>
        {open && (
          <Portal>
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 80,
              background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "flex-end",
            }}>
            <motion.div
              role="menu"
              aria-label={title}
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%", background: "var(--c-panel-bg)",
                borderTopLeftRadius: 20, borderTopRightRadius: 20,
                padding: "8px 10px calc(14px + env(safe-area-inset-bottom, 0px))",
                borderTop: "1px solid var(--c-border)",
              }}>
              {/* Grab handle, so the sheet reads as dismissible */}
              <div aria-hidden="true" style={{
                width: 38, height: 4, borderRadius: 2, margin: "4px auto 10px",
                background: "var(--c-border-strong)",
              }} />
              <div style={{
                fontFamily: UI, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase",
                color: "var(--c-text-ghost)", padding: "0 10px 8px",
              }}>
                {title}
              </div>

              {shown.map((item, i) => {
                const danger = item.tone === "destructive";
                const Icon = item.icon;
                return (
                  <button
                    key={item.label + i}
                    type="button"
                    role="menuitem"
                    onClick={() => pick(item)}
                    disabled={item.disabled}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "13px 12px", borderRadius: 12,
                      background: "none", border: "none",
                      borderTop: i === 0 ? "none" : "1px solid var(--c-border-faint)",
                      color: danger ? "var(--c-danger-soft)" : "var(--c-text)",
                      cursor: item.disabled ? "default" : "pointer",
                      opacity: item.disabled ? 0.45 : 1,
                      font: "inherit", textAlign: "left", minHeight: 52,
                    }}>
                    {Icon && (
                      <span style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: danger ? "rgba(248,113,113,0.14)" : "var(--c-surface-2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon size={16} strokeWidth={2} />
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: UI, fontSize: 15, fontWeight: 500 }}>
                        {item.label}
                      </span>
                      {item.detail && (
                        <span style={{ display: "block", fontFamily: UI, fontSize: 12, color: "var(--c-text-faint)", marginTop: 1 }}>
                          {item.detail}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: "100%", marginTop: 8, padding: "13px", borderRadius: 12,
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-dim)", fontFamily: UI, fontSize: 14, cursor: "pointer",
                }}>
                Close
              </button>
            </motion.div>
          </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
