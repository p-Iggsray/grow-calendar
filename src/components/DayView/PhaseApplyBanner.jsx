export function PhaseApplyBanner({ phaseName, onApply, onDismiss }) {
  return (
    <>
      <div
        onClick={onDismiss}
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
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)", marginBottom: 8 }}>
          Apply to all {phaseName} days?
        </div>
        <div style={{ fontSize: 13, color: "var(--c-text-dim)", lineHeight: 1.7, marginBottom: 18 }}>
          This will update this task text across every day in the {phaseName} phase, not just today.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12,
              background: "var(--c-surface-1)", border: "1px solid var(--c-surface-2)",
              color: "var(--c-text-dim)", cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}>
            Just today
          </button>
          <button
            type="button"
            onClick={onApply}
            style={{
              flex: 2, padding: "14px 0", borderRadius: 12,
              background: "var(--c-accent)", border: "none",
              color: "#000", cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>
            All {phaseName} days
          </button>
        </div>
      </div>
    </>
  );
}
