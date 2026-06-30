import { useState } from "react";
import { Wind, X } from "lucide-react";
import ConfirmModal from "../ConfirmModal.jsx";
import { MONO, ymd, useLifecycleSave } from "./shared.jsx";

// Smart nudge shown on the growing calendar once the final-harvest date has
// passed: offers to switch the app into the drying tracker. Dismissible for the
// session (it reappears next load until the grower actually starts drying).
export default function PhasePrompt({ today }) {
  const { save, busy } = useLifecycleSave();
  const [confirm, setConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function startDrying() {
    setConfirm(false);
    save({ phase: "drying", dryStartedAt: ymd(today) });
  }

  return (
    <div style={{ padding: "10px 14px 0" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.4)",
        borderRadius: 14, padding: "12px 14px",
      }}>
        <Wind size={20} strokeWidth={1.8} style={{ color: "#f59e0b", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text)" }}>Harvest wrapped up?</div>
          <div style={{ fontSize: 12.5, color: "var(--c-text-dim)", lineHeight: 1.5 }}>
            The calendar&rsquo;s done its job — switch to the drying tracker once you&rsquo;ve cut.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={busy}
          style={{
            flexShrink: 0, background: "#f59e0b", border: "none", borderRadius: 10,
            padding: "9px 13px", color: "#1a1206", fontFamily: MONO, fontSize: 12,
            fontWeight: 700, letterSpacing: 0.5, cursor: busy ? "default" : "pointer",
          }}>
          Start drying
        </button>
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

      <ConfirmModal
        open={confirm}
        title="Start drying?"
        message="This hides the calendar and opens the drying tracker, starting the dry-day counter today. You can keep logging in Plants and chatting with MJ."
        confirmLabel="Start drying"
        cancelLabel="Not yet"
        onConfirm={startDrying}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
