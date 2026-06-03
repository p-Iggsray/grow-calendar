import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { version } from "../../package.json";
import ConfirmModal from "./ConfirmModal.jsx";

export default function AuthFooter({ onBeforeSignOut }) {
  const { user, logout } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  async function confirmLogout() {
    setShowLogoutModal(false);
    // Best-effort save of any in-flight client state (e.g. a typed note still
    // inside its autosave debounce) before the session is destroyed.
    try { await onBeforeSignOut?.(); }
    catch { /* a save failure shouldn't block sign-out */ }
    try { await logout(); }
    catch { /* page will refresh state */ }
  }

  return (
    <>
      <div style={{
        padding: "24px 16px 8px", textAlign: "center",
        fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-text-ghost)",
      }}>
        Signed in as <span style={{ color: "var(--c-text-muted)" }}>{user.username}</span>
        <span style={{ margin: "0 8px" }}>·</span>
        <button
          onClick={() => setShowLogoutModal(true)}
          style={{
            background: "none", border: "none", color: "var(--c-text-faint)",
            cursor: "pointer", fontFamily: "inherit", fontSize: "inherit",
            textDecoration: "underline", padding: 0,
          }}>
          Sign out
        </button>
        <div style={{ marginTop: 8, opacity: 0.5 }}>v{version}</div>
      </div>
      <ConfirmModal
        open={showLogoutModal}
        title="Sign out?"
        message="Any unsaved notes will be saved first. You'll need to sign in again to see your grow plan and tasks."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        tone="destructive"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />
    </>
  );
}
