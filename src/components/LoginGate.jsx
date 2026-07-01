import { useState, useEffect } from "react";
import { useAuth } from "../lib/auth.jsx";
import { api } from "../lib/api.js";

const LABEL_STYLE = {
  fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)",
  textTransform: "uppercase", fontFamily: "var(--font-ui)",
};
const INPUT_STYLE = {
  background: "var(--c-input-bg)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--c-text)",
  fontSize: 14,
  fontFamily: "var(--font-ui)",
  outline: "none",
  width: "100%",
};

export default function LoginGate() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [username,        setUsername]        = useState("");
  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]        = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken,      setResetToken]      = useState(null);
  const [error,           setError]           = useState("");
  const [successMsg,      setSuccessMsg]      = useState("");
  const [busy,            setBusy]            = useState(false);

  // Detect ?reset=TOKEN in the URL and auto-enter reset mode.
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("reset");
    if (token) {
      setResetToken(token);
      setMode("reset");
      url.searchParams.delete("reset");
      window.history.replaceState({}, "", url.pathname + (url.search || ""));
    }
  }, []);

  function switchMode(next) {
    setError("");
    setSuccessMsg("");
    setMode(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else if (mode === "signup") {
        await signup(username.trim(), firstName.trim(), lastName.trim(), password);
      } else if (mode === "reset") {
        if (password !== confirmPassword) { setError("Passwords don't match"); return; }
        await api.resetPassword(resetToken, password);
        setSuccessMsg("Password updated! Please log in.");
        setPassword("");
        setConfirmPassword("");
        switchMode("login");
      }
    } catch (err) {
      setError(err.message || "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = {
    login:   busy ? "..." : "LOG IN",
    signup:  busy ? "..." : "REQUEST ACCOUNT",
    reset:   busy ? "..." : "SET NEW PASSWORD",
  }[mode];

  const submitDisabled = busy || (
    mode === "login"  ? (!username || !password) :
    mode === "signup" ? (!username || !firstName || !lastName || !password) :
    mode === "reset"  ? (!password || !confirmPassword) :
    false
  );

  return (
    <div style={{
      fontFamily: "var(--font-ui)",
      minHeight: "100vh",
      background: "var(--c-header-bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, color: "var(--c-text)",
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: "var(--c-surface-1)",
        border: "1px solid var(--c-surface-2)",
        borderRadius: 14, padding: "26px 22px 22px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "var(--c-text-faint)", textTransform: "uppercase", marginBottom: 6, fontFamily: "var(--font-ui)" }}>
            Grow Log
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: "var(--c-text)" }}>
            The Grow Calendar
          </div>
        </div>

        {/* Success banner */}
        {successMsg && (
          <div style={{ fontSize: 12, color: "var(--c-accent)", lineHeight: 1.5, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Username — login / signup only */}
            {(mode === "login" || mode === "signup") && (
              <Field label="Username" value={username} onChange={setUsername} autoComplete="username" autoFocus={mode === "login"} />
            )}

            {/* Name fields — signup only */}
            {mode === "signup" && (
              <>
                <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
                <Field label="Last name"  value={lastName}  onChange={setLastName}  autoComplete="family-name" />
              </>
            )}

            {/* Password — login / signup / reset */}
            {(mode === "login" || mode === "signup") && (
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            )}
            {mode === "reset" && (
              <>
                <PasswordField label="New password"     value={password}        onChange={setPassword}        autoComplete="new-password" autoFocus />
                <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ fontSize: 12, color: "var(--c-danger-soft)", lineHeight: 1.5, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "8px 10px" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitDisabled}
              style={{
                marginTop: 4, padding: "10px 14px", minHeight: 44,
                background: busy ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.15)",
                border: "1px solid rgba(34,197,94,0.35)",
                borderRadius: 10, color: "var(--c-accent)",
                fontSize: 13, fontFamily: "var(--font-ui)",
                cursor: submitDisabled ? "default" : "pointer",
                letterSpacing: 1, opacity: submitDisabled ? 0.5 : 1,
              }}>
              {submitLabel}
            </button>

            {/* No self-service reset — the admin issues reset links by hand */}
            {mode === "login" && (
              <div style={{ fontSize: 11, letterSpacing: 0.5, color: "var(--c-text-faint)", fontFamily: "var(--font-ui)", textAlign: "center", lineHeight: 1.6, marginTop: 2 }}>
                Forgot your password? Contact the admin to get a reset link.
              </div>
            )}
          </form>

        {/* Mode toggle — login ↔ signup */}
        {(mode === "login" || mode === "signup") && (
          <button
            type="button"
            onClick={() => { setError(""); setSuccessMsg(""); setMode(mode === "login" ? "signup" : "login"); }}
            style={{ ...linkBtnStyle, marginTop: 14, width: "100%" }}>
            {mode === "login" ? "Need an account? Request one" : "Have an account? Log in"}
          </button>
        )}

        {/* Back to login — reset */}
        {mode === "reset" && (
          <button type="button" onClick={() => switchMode("login")} style={{ ...linkBtnStyle, marginTop: 14, width: "100%" }}>
            Back to login
          </button>
        )}

        {/* Legal / privacy disclaimer — signup screen only */}
        {mode === "signup" && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--c-surface-2)", fontFamily: "var(--font-ui)" }}>
            <p style={{ fontSize: 10, lineHeight: 1.6, color: "var(--c-text-faint)", margin: 0 }}>
              For educational and personal record-keeping only — not medical, legal, or professional cultivation advice. Intended for adults of legal age. You are responsible for complying with the cannabis laws in your area.
            </p>
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", cursor: "pointer", textTransform: "uppercase" }}>Privacy</summary>
              <p style={{ fontSize: 10, lineHeight: 1.6, color: "var(--c-text-faint)", margin: "6px 0 0" }}>
                Your account and grow data are stored privately to run the app and are never sold. AI features send your grow details to Google&apos;s Gemini API to generate replies. Ask the admin to delete your account and data at any time.
              </p>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

const linkBtnStyle = {
  background: "none", border: "none",
  color: "var(--c-text-faint)", fontFamily: "var(--font-ui)",
  fontSize: 11, letterSpacing: 1, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  textAlign: "center", width: "100%", minHeight: 44, padding: "8px",
};

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
        onBlur={e => { e.target.style.borderColor = "var(--c-border)"; }}
      />
    </label>
  );
}

function PasswordField({ label = "Password", value, onChange, autoComplete, autoFocus }) {
  const [reveal, setReveal] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  function updateCapsLock(e) {
    if (typeof e.getModifierState === "function") setCapsLockOn(e.getModifierState("CapsLock"));
  }

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={LABEL_STYLE}>{label}</span>
        {capsLockOn && (
          <span role="status" aria-live="polite" style={{ fontSize: 11, letterSpacing: 1.5, fontFamily: "var(--font-ui)", color: "var(--c-warn)", background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.35)", borderRadius: 6, padding: "1px 6px", textTransform: "uppercase" }}>
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
          onBlur={e => { e.target.style.borderColor = "var(--c-border)"; setCapsLockOn(false); }}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          style={{ ...INPUT_STYLE, paddingRight: 44 }}
          onFocus={e => { e.target.style.borderColor = "rgba(74,222,128,0.5)"; }}
        />
        <button
          type="button"
          className="touch-target"
          onClick={() => setReveal(r => !r)}
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          tabIndex={-1}
          style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", padding: 8, cursor: "pointer", color: reveal ? "var(--c-accent)" : "var(--c-text-faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EyeIcon hidden={reveal} />
        </button>
      </div>
    </label>
  );
}

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
