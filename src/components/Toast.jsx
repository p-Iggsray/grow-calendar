import { useToast } from "../lib/useToast.jsx";

export default function Toast() {
  const { toasts } = useToast();
  if (!toasts.length) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          background: "rgba(30,10,10,0.92)",
          border: "1px solid rgba(220,38,38,0.45)",
          borderRadius: 10,
          padding: "10px 18px",
          color: "#fca5a5",
          fontFamily: "'Courier New', monospace",
          fontSize: 12,
          letterSpacing: 0.3,
          whiteSpace: "nowrap",
          backdropFilter: "blur(8px)",
        }}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
