// ─── Style helpers ──────────────────────────────────────────────────────────

export const MONO = "'Courier New', monospace";
export const SERIF = "'Georgia', 'Times New Roman', serif";

export function Label({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

export function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", boxSizing: "border-box",
        background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
        border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
        padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
        outline: "none",
      }}
    />
  );
}

export function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(opt => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className="touch-target"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "9px 16px", borderRadius: 10,
              background: sel ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.05)",
              border: sel ? "1.5px solid rgba(34,197,94,0.5)" : "1px solid var(--c-border-strong)",
              color: sel ? "var(--c-accent)" : "#8ab89a",
              fontFamily: MONO, fontSize: 12, cursor: "pointer",
              letterSpacing: 0.5, whiteSpace: "nowrap",
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function NumStepper({ value, onChange, min = 1, max = 10, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        className="touch-target"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)", color: value <= min ? "var(--c-text-ghost)" : "var(--c-text-dim)",
          fontSize: 20, cursor: value <= min ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        −
      </button>
      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "var(--c-text)", minWidth: 32, textAlign: "center" }}>
        {value}
      </span>
      <button
        type="button"
        className="touch-target"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)", color: value >= max ? "var(--c-text-ghost)" : "var(--c-text-dim)",
          fontSize: 20, cursor: value >= max ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        +
      </button>
      {label && <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)" }}>{label}</span>}
    </div>
  );
}
