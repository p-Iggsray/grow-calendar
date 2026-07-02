import { useState } from "react";
import { motion } from "framer-motion";
import { Wind, X } from "lucide-react";
import ConfirmModal from "../ConfirmModal.jsx";
import { MONO, ymd, useLifecycleSave } from "./shared.jsx";

// Entry point for switching the app into the drying tracker. It's available the
// whole growing phase, but its prominence depends on timing:
//   • not due yet (before final harvest) → a quiet inline link, easy to ignore
//   • due (harvest date passed)          → a bright amber banner that gently
//     pulses to signal it's time to move on
// The bright banner can be dismissed; the quiet link always remains so drying
// can still be started early at any point.
export default function PhasePrompt({ today, due }) {
  const { save, busy } = useLifecycleSave();
  const [confirm, setConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function startDrying() {
    setConfirm(false);
    save({ phase: "drying", dryStartedAt: ymd(today) });
  }

  const modal = (
    <ConfirmModal
      open={confirm}
      title="Start drying?"
      message="This hides the calendar and opens the drying tracker, starting the dry-day counter today. You can keep logging in Plants and chatting with MJ."
      confirmLabel="Start drying"
      cancelLabel="Not yet"
      onConfirm={startDrying}
      onCancel={() => setConfirm(false)}
    />
  );

  // Quiet mode: a real, tappable button - just styled calmly so it doesn't
  // compete with the calendar. Shown before harvest, or after the bright banner
  // is dismissed.
  if (!due || dismissed) {
    return (
      <div style={{ padding: "10px 14px 0" }}>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={busy}
          style={{
            width: "100%", minHeight: 46, padding: "12px 14px", borderRadius: 12,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", cursor: busy ? "default" : "pointer",
            fontFamily: MONO, fontSize: 12.5, letterSpacing: 0.5,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
          <Wind size={15} strokeWidth={1.8} />
          Start drying
        </button>
        {modal}
      </div>
    );
  }

  // Due mode: bright, gently pulsing banner.
  return (
    <div style={{ padding: "10px 14px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)",
        borderRadius: 14, padding: "12px 14px",
      }}>
        <Wind size={20} strokeWidth={1.8} style={{ color: "#f59e0b", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text)" }}>Time to dry?</div>
          <div style={{ fontSize: 12.5, color: "var(--c-text-dim)", lineHeight: 1.5 }}>
            The calendar&rsquo;s done its job - switch to the drying tracker once you&rsquo;ve cut.
          </div>
        </div>
        <motion.button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={busy}
          // Gentle attention nudge: a slow brightness + scale pulse so it reads
          // as "it's time" without being annoying.
          animate={{ scale: [1, 1.06, 1], boxShadow: ["0 0 0 rgba(245,158,11,0)", "0 0 14px rgba(245,158,11,0.6)", "0 0 0 rgba(245,158,11,0)"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            flexShrink: 0, background: "#f59e0b", border: "none", borderRadius: 10,
            padding: "9px 13px", color: "#1a1206", fontFamily: MONO, fontSize: 12,
            fontWeight: 700, letterSpacing: 0.5, cursor: busy ? "default" : "pointer",
          }}>
          Start drying
        </motion.button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, background: "none", border: "none", color: "var(--c-text-ghost)",
            cursor: "pointer", display: "flex", alignItems: "center", padding: 4,
          }}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      {modal}
    </div>
  );
}
