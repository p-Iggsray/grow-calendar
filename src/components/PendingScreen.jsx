import { useAuth } from "../lib/auth.jsx";

export default function PendingScreen() {
  const { user, logout } = useAuth();
  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      minHeight: "100vh",
      background: "var(--c-header-bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, color: "var(--c-text)",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, textAlign: "center",
        background: "var(--c-surface-1)",
        border: "1px solid var(--c-surface-2)",
        borderRadius: 14, padding: "30px 24px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🌱</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--c-text)", marginBottom: 10 }}>
          Request received
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--c-text-dim)" }}>
          Thanks, {user?.username}. Your account is waiting for the owner to approve it.
          Check back soon - once you are approved you will have full access to your grow.
        </p>
        <button
          onClick={logout}
          className="touch-target"
          style={{
            marginTop: 18, padding: "9px 16px",
            background: "var(--c-border-faint)",
            border: "1px solid var(--c-border-strong)",
            borderRadius: 10, color: "var(--c-text-dim)",
            fontFamily: "'Courier New', monospace", fontSize: 12,
            letterSpacing: 1, cursor: "pointer",
          }}>
          LOG OUT
        </button>
      </div>
    </div>
  );
}
