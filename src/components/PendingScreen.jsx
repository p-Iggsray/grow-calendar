import { useAuth } from "../lib/auth.jsx";

export default function PendingScreen() {
  const { user, logout } = useAuth();
  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0a1a0d 0%, #1a3a1e 50%, #0d2410 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, color: "#f0ebe0",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, textAlign: "center",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: "30px 24px",
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🌱</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#e8f5e3", marginBottom: 10 }}>
          Request received
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#c8d8c8" }}>
          Thanks, {user?.username}. Your account is waiting for the owner to approve it.
          Check back soon - once you are approved you will have full access to your grow.
        </p>
        <button
          onClick={logout}
          style={{
            marginTop: 18, padding: "9px 16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10, color: "#cbd5cb",
            fontFamily: "'Courier New', monospace", fontSize: 12,
            letterSpacing: 1, cursor: "pointer",
          }}>
          LOG OUT
        </button>
      </div>
    </div>
  );
}
