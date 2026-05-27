import { useEffect, useState, useCallback } from "react";
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
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto", color: "#1a2e1a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Members</h2>
        <button onClick={onClose} style={btn}>Close</button>
      </div>

      {error && <div style={errBox}>{error}</div>}
      {loading ? <div>Loading...</div> : (
        <>
          <Section title={`Pending requests (${pending.length})`}>
            {pending.length === 0 && <Empty>No pending requests.</Empty>}
            {pending.map(u => (
              <Row key={u.id} name={u.username} sub={`requested ${u.created_at?.slice(0,10) || ""}`}>
                <button style={btnGreen} onClick={() => act(api.approveUser, u.id)}>Approve</button>
                <button style={btnRed} onClick={() => confirmDelete(u)}>Reject</button>
              </Row>
            ))}
          </Section>

          <Section title={`Members (${members.length})`}>
            {members.map(u => (
              <Row key={u.id} name={u.username} sub={u.role === "admin" ? "admin" : "member"}>
                {u.id !== user.id && u.role !== "admin" && (
                  <button style={btnRed} onClick={() => confirmDelete(u)}>Remove</button>
                )}
              </Row>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#5a8a5a", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ name, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", border: "1px solid #d8e6d8", borderRadius: 10, marginBottom: 8 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 12, color: "#6b836b" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ fontSize: 13, color: "#6b836b", fontStyle: "italic" }}>{children}</div>;
}
const btn = { padding: "6px 12px", border: "1px solid #c2d2c2", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 };
const btnGreen = { ...btn, background: "#16a34a", color: "#fff", border: "none" };
const btnRed = { ...btn, background: "#dc2626", color: "#fff", border: "none" };
const errBox = { background: "#fde8e8", border: "1px solid #f5b5b5", color: "#a11", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 13 };
