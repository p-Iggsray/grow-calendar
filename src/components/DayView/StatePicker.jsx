import { Check, Minus, X } from "lucide-react";

export function StatePicker({ task, currentState, onPick, onClose }) {
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
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginBottom: 16, fontFamily: "'Courier New', monospace", letterSpacing: 0.5, lineHeight: 1.5 }}>
          {task}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { state: "done",    label: "Done",    icon: <Check size={16} strokeWidth={2.5} />, color: "var(--c-accent)", bg: "rgba(74,222,128,0.1)" },
            { state: "skipped", label: "Skipped", icon: <Minus size={16} strokeWidth={2.5} />, color: "var(--c-warn)", bg: "rgba(250,204,21,0.1)" },
            { state: "blocked", label: "Blocked", icon: <X    size={16} strokeWidth={2.5} />, color: "var(--c-danger)", bg: "rgba(248,113,113,0.1)" },
          ].map(({ state, label, icon, color, bg }) => (
            <button
              key={state}
              type="button"
              onClick={() => onPick(state === currentState ? null : state)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 12,
                background: currentState === state ? bg : "var(--c-surface-1)",
                border: `1px solid ${currentState === state ? color + "66" : "var(--c-surface-2)"}`,
                color, cursor: "pointer", textAlign: "left",
                fontSize: 15, fontWeight: 600,
              }}>
              {icon}
              {label}
              {currentState === state && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "'Courier New', monospace", color: "var(--c-text-faint)" }}>
                  tap to clear
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
