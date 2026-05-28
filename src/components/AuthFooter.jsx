import { useAuth } from "../lib/auth.jsx";
import { version } from "../../package.json";

export default function AuthFooter() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    if (!confirm("Sign out?")) return;
    try { await logout(); }
    catch { /* page will refresh state */ }
  }

  return (
    <div style={{
      padding: "24px 16px 8px", textAlign: "center",
      fontFamily: "'Courier New', monospace", fontSize: 11, color: "#3a5a3a",
    }}>
      Signed in as <span style={{ color: "#7a9a7a" }}>{user.username}</span>
      <span style={{ margin: "0 8px" }}>·</span>
      <button
        onClick={handleLogout}
        style={{
          background: "none", border: "none", color: "#5a8a5a",
          cursor: "pointer", fontFamily: "inherit", fontSize: "inherit",
          textDecoration: "underline", padding: 0,
        }}>
        Sign out
      </button>
      <div style={{ marginTop: 8, opacity: 0.5 }}>v{version}</div>
    </div>
  );
}
