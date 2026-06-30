import { MONO, SERIF } from "./styleHelpers.jsx";

export function GeneratingScreen({ manual = false }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "50vh", gap: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 48 }}>🌱</div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: "var(--c-accent)", letterSpacing: 2, marginBottom: 8 }}>
          BUILDING YOUR CALENDAR
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: "var(--c-text-muted)", lineHeight: 1.8, maxWidth: 280 }}>
          {manual
            ? "Laying out your phase timeline. Just a moment…"
            : "The AI is analyzing your setup and generating a personalized grow schedule. This takes about 30 seconds."}
        </div>
      </div>
      <Spinner />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      border: "3px solid rgba(34,197,94,0.15)",
      borderTopColor: "var(--c-accent)",
      animation: "spin 0.9s linear infinite",
    }} />
  );
}
