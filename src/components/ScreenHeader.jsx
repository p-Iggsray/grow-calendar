import { ChevronLeft } from "lucide-react";

// Shared native-style screen header: a round back button, an eyebrow + title
// stack, and an optional right-side slot. Sticky with a blur so content slides
// beneath it like a real mobile app header.
export default function ScreenHeader({ eyebrow, title, onBack, backLabel = "Back", right, sticky = true }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px",
      paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
      ...(sticky ? { position: "sticky", top: 0, zIndex: 10 } : {}),
      background: "var(--c-tab-bar-bg)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--c-border-faint)",
    }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
            background: "var(--c-surface-2)", border: "none",
            color: "var(--c-text)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <ChevronLeft size={20} strokeWidth={2.4} style={{ marginLeft: -2 }} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
            color: "var(--c-text-muted)", marginBottom: 1,
          }}>
            {eyebrow}
          </div>
        )}
        <div style={{
          fontSize: 19, fontWeight: 700, letterSpacing: -0.4, color: "var(--c-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}
