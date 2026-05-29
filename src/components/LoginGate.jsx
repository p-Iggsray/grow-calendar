import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { LOCATION } from "../lib/appConfig.js";

const LABEL_STYLE = {
  fontSize: 10, letterSpacing: 2, color: "#5a8a5a",
  textTransform: "uppercase", fontFamily: "'Courier New', monospace",
};
const INPUT_STYLE = {
  background: "rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#e8f5e3",
  fontSize: 14,
  fontFamily: "'Courier New', monospace",
  outline: "none",
  width: "100%",
};

export default function LoginGate() {
  const { login, signup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "signup"

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") await signup(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError(err.message || "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0a1a0d 0%, #1a3a1e 50%, #0d2410 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      color: "#f0ebe0",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 380,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "26px 22px 22px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{
            fontSize: 10, letterSpacing: 4, color: "#5a8a5a",
            textTransform: "uppercase", marginBottom: 6,
            fontFamily: "'Courier New', monospace",
          }}>
            Grow Log · {LOCATION}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: "#e8f5e3" }}>
            The Grow Calendar
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            autoFocus
          />
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />

          {error && (
            <div style={{
              fontSize: 12, color: "#fca5a5", lineHeight: 1.5,
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 8, padding: "8px 10px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            style={{
              marginTop: 4,
              padding: "10px 14px",
              background: busy ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.15)",
              border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: 10,
              color: "#4ade80",
              fontSize: 13,
              fontFamily: "'Courier New', monospace",
              cursor: busy || !username || !password ? "default" : "pointer",
              letterSpacing: 1,
              opacity: !username || !password ? 0.5 : 1,
            }}>
            {busy ? "..." : mode === "signup" ? "REQUEST ACCOUNT" : "LOG IN"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setError(""); setMode(mode === "login" ? "signup" : "login"); }}
          style={{
            marginTop: 14, width: "100%", background: "none", border: "none",
            color: "#5a8a5a", fontFamily: "'Courier New', monospace",
            fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>
          {mode === "login" ? "Need an account? Request one" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, autoFocus }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={LABEL_STYLE}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={INPUT_STYLE}
        onFocus={e => { e.target.style.borderColor = "rgba(74,222,128,0.5)"; }}
        onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
      />
    </label>
  );
}

function PasswordField({ value, onChange, autoComplete }) {
  const [reveal, setReveal] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  function updateCapsLock(e) {
    if (typeof e.getModifierState === "function") {
      setCapsLockOn(e.getModifierState("CapsLock"));
    }
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={LABEL_STYLE}>Password</span>
        {capsLockOn && (
          <span
            role="status"
            aria-live="polite"
            style={{
              fontSize: 9, letterSpacing: 1.5, fontFamily: "'Courier New', monospace",
              color: "#facc15", background: "rgba(250,204,21,0.12)",
              border: "1px solid rgba(250,204,21,0.35)",
              borderRadius: 6, padding: "1px 6px", textTransform: "uppercase",
            }}>
            Caps Lock
          </span>
        )}
      </span>
      <div style={{ position: "relative" }}>
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={updateCapsLock}
          onKeyUp={updateCapsLock}
          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; setCapsLockOn(false); }}
          autoComplete={autoComplete}
          style={{ ...INPUT_STYLE, paddingRight: 44 }}
          onFocus={e => { e.target.style.borderColor = "rgba(74,222,128,0.5)"; }}
        />
        <button
          type="button"
          onClick={() => setReveal(r => !r)}
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          tabIndex={-1}
          style={{
            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
            background: "transparent", border: "none",
            padding: 8, cursor: "pointer",
            color: reveal ? "#4ade80" : "#5a8a5a",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <EyeIcon hidden={reveal} />
        </button>
      </div>
    </label>
  );
}

// Open eye when password is hidden (click to reveal); closed eye when revealed
// (click to hide). Matches the convention every major site uses.
function EyeIcon({ hidden }) {
  return hidden ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
