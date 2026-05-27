import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";

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
            Grow Log · Athens, Ohio
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
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
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
      <span style={{
        fontSize: 10, letterSpacing: 2, color: "#5a8a5a",
        textTransform: "uppercase", fontFamily: "'Courier New', monospace",
      }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "10px 12px",
          color: "#e8f5e3",
          fontSize: 14,
          fontFamily: "'Courier New', monospace",
          outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "rgba(74,222,128,0.5)"; }}
        onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
      />
    </label>
  );
}
