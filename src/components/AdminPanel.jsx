import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function AdminPanel({ onClose }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const pending = users.filter(u => u.status === "pending");
  const members = users.filter(u => u.status === "approved");

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Courier New', monospace", color: "var(--c-text)" }}>
      {/* Header — safe-area-aware so the X button clears the notch */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 16px",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--c-surface-2)",
        background: "linear-gradient(160deg, #0a1a0d, #13301a)",
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
            fontSize: 12, color: "#fca5a5",
          }}>
            {error}
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
  const green = color === "green";
  return (
    <button
      onClick={onClick}
      className="touch-target"
      style={{
        padding: "7px 14px",
        background: green ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.15)",
        border: `1px solid ${green ? "rgba(34,197,94,0.35)" : "rgba(220,38,38,0.35)"}`,
        borderRadius: 8,
        color: green ? "var(--c-accent)" : "#f87171",
        cursor: "pointer",
        fontSize: 11, letterSpacing: 0.5,
        fontFamily: "'Courier New', monospace",
        minHeight: 36,
      }}
    >
      {children}
    </button>
  );
}
