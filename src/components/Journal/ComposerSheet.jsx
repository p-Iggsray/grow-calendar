import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useDayNote } from "../../lib/useDayNote.js";
import { MONTH_NAMES } from "../../lib/dates.js";
import { tapHaptic } from "../../lib/haptics.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Full-screen writing surface for a day's journal entry (the day note).
// Serif text, autosave while typing, Done flushes and closes.
export default function ComposerSheet({ date, growId, onClose }) {
  const { note, setNote, status, flush } = useDayNote(date, true, growId);
  const areaRef = useRef(null);

  useEffect(() => {
    // Focus after the slide-up settles so the keyboard doesn't fight the spring.
    const t = setTimeout(() => areaRef.current?.focus(), 220);
    return () => clearTimeout(t);
  }, []);

  async function done() {
    tapHaptic();
    await flush();
    window.dispatchEvent(new CustomEvent("journal-mutated"));
    onClose();
  }

  return (
    <motion.div
      key="journal-composer"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "var(--c-bg)",
        display: "flex", flexDirection: "column",
      }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 10px",
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--c-border-faint)",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-muted)" }}>
            {WEEKDAYS[date.getDay()]}
          </div>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 16.5, fontWeight: 800, letterSpacing: -0.2, color: "var(--c-text)" }}>
            {MONTH_NAMES[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 10.5, letterSpacing: 1, color: status === "error" ? "var(--c-danger-soft)" : "var(--c-text-ghost)" }}>
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed - retrying on Done" : ""}
          </span>
          <button
            type="button"
            className="touch-target"
            onClick={done}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 18,
              background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.45)",
              color: "var(--c-accent)", fontFamily: "var(--font-ui)",
              fontSize: 12.5, fontWeight: 700, letterSpacing: 0.5, cursor: "pointer",
            }}>
            <Check size={14} strokeWidth={2.5} />
            Done
          </button>
        </div>
      </div>

      {/* Writing surface */}
      <textarea
        ref={areaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Write about today in the garden - what you saw, what you did, how the plants are doing…"
        maxLength={20000}
        style={{
          flex: 1, width: "100%", boxSizing: "border-box",
          padding: "18px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
          background: "none", border: "none", outline: "none", resize: "none",
          fontFamily: "var(--font-journal)", fontSize: 17.5, lineHeight: 1.85,
          color: "var(--c-text)", caretColor: "var(--c-accent)",
        }}
      />
    </motion.div>
  );
}
