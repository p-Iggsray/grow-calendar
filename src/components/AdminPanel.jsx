import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function AdminPanel({ onClose }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetLink, setResetLink] = useState(null); // { username, url }
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await api.adminListUsers();
      setUsers(users);
      setError("");
    } catch (err) {
      setError(err.message || "could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function act(fn, id) {
    try { await fn(id); await refresh(); }
    catch (err) { setError(err.message || "action failed"); }
  }

  function confirmDelete(u) {
    if (window.confirm(`Permanently delete "${u.username}" and all of their data? This cannot be undone.`)) {
      act(api.deleteUser, u.id);
    }
  }

  async function genResetLink(u) {
    setError("");
    try {
      const { resetUrl } = await api.adminResetLink(u.id);
      setResetLink({ username: u.username, url: resetUrl });
      setCopied(false);
      // Best-effort auto-copy; if the browser blocks it the admin can still copy manually.
      try { await navigator.clipboard?.writeText(resetUrl); setCopied(true); } catch { /* ignore */ }
    } catch (err) {
      setError(err.message || "could not create reset link");
    }
  }

  const pending = users.filter(u => u.status === "pending");
  const members = users.filter(u => u.status === "approved");

  return (
    <div style={{ minHeight: "100vh", fontFamily: "var(--font-ui)", color: "var(--c-text)" }}>
      {/* Header — safe-area-aware so the X button clears the notch */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--c-surface-2)",
        background: "var(--c-header-bg)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "var(--c-text-faint)", textTransform: "uppercase", marginBottom: 3 }}>
            Admin
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.3 }}>
            Manage Members
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="touch-target"
          style={{
            background: "var(--c-border-soft)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 10, width: 40, height: 40,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--c-text-dim)", flexShrink: 0,
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px", maxWidth: 560, margin: "0 auto" }}>
        {error && (
          <div style={{
            background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 14,
            fontSize: 12, color: "var(--c-danger-soft)",
          }}>
            {error}
          </div>
        )}

        {resetLink && (
          <div style={{
            background: "var(--c-surface-1)", border: "1px solid rgba(59,130,246,0.35)",
            borderRadius: 10, padding: 12, marginBottom: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--c-text-faint)" }}>
                Reset link for {resetLink.username}
              </div>
              <button onClick={() => setResetLink(null)} aria-label="Dismiss"
                style={{ background: "none", border: "none", color: "var(--c-text-dim)", cursor: "pointer", padding: 2, display: "flex" }}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <input readOnly value={resetLink.url} onFocus={e => e.target.select()}
              style={{
                width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui)",
                fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--c-border)",
                background: "var(--c-input-bg)", color: "var(--c-text)", marginBottom: 10,
              }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ActionBtn color="blue" onClick={async () => {
                try { await navigator.clipboard.writeText(resetLink.url); setCopied(true); } catch { /* ignore */ }
              }}>
                {copied ? "Copied!" : "Copy link"}
              </ActionBtn>
              <span style={{ fontSize: 11, color: "var(--c-text-faint)", lineHeight: 1.5 }}>
                Send this to {resetLink.username}. Expires in 24h; only the newest link works.
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: "var(--c-text-ghost)", letterSpacing: 3, padding: "24px 0" }}>LOADING...</div>
        ) : (
          <>
            <Section title={`Pending requests (${pending.length})`}>
              {pending.length === 0 && <Empty>No pending requests.</Empty>}
              {pending.map(u => (
                <Row key={u.id} name={u.username} sub={`requested ${u.created_at?.slice(0, 10) || ""}`}>
                  <ActionBtn color="green" onClick={() => act(api.approveUser, u.id)}>Approve</ActionBtn>
                  <ActionBtn color="red" onClick={() => confirmDelete(u)}>Reject</ActionBtn>
                </Row>
              ))}
            </Section>

            <Section title={`Members (${members.length})`}>
              {members.map(u => (
                <Row key={u.id} name={u.username} sub={u.role === "admin" ? "admin" : "member"}>
                  {u.id !== user.id && (
                    <ActionBtn color="blue" onClick={() => genResetLink(u)}>Reset link</ActionBtn>
                  )}
                  {u.id !== user.id && u.role !== "admin" && (
                    <ActionBtn color="red" onClick={() => confirmDelete(u)}>Remove</ActionBtn>
                  )}
                </Row>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
        color: "var(--c-text-faint)", marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ name, sub, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px",
      background: "var(--c-surface-1)",
      border: "1px solid var(--c-surface-2)",
      borderRadius: 12, marginBottom: 8,
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--c-text)" }}>{name}</div>
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>{children}</div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ fontSize: 12, color: "var(--c-text-ghost)", fontStyle: "italic", padding: "4px 0" }}>
      {children}
    </div>
  );
}

function ActionBtn({ color, onClick, children }) {
  const palette = {
    green: { bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.35)", fg: "var(--c-accent)" },
    red:   { bg: "rgba(220,38,38,0.15)", bd: "rgba(220,38,38,0.35)", fg: "#f87171" },
    blue:  { bg: "rgba(59,130,246,0.15)", bd: "rgba(59,130,246,0.4)", fg: "#60a5fa" },
  }[color] || { bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.35)", fg: "var(--c-accent)" };
  return (
    <button
      onClick={onClick}
      className="touch-target"
      style={{
        padding: "7px 14px",
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        borderRadius: 8,
        color: palette.fg,
        cursor: "pointer",
        fontSize: 11, letterSpacing: 0.5,
        fontFamily: "var(--font-ui)",
        minHeight: 36,
      }}
    >
      {children}
    </button>
  );
}
