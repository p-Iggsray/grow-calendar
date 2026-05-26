import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";

const SUGGESTIONS = [
  "What should I be doing today?",
  "Mark today's watering done",
  "Add a note to today: lower leaves yellowing",
];

export default function ChatPanel({ onClose }) {
  const [messages, setMessages] = useState([]); // { role, content }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const { reply, actions } = await api.mj(next);
      setMessages([...next, { role: "assistant", content: reply, actions: actions || [] }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, background: "#0e1a12",
      display: "flex", flexDirection: "column",
      paddingTop: "env(safe-area-inset-top, 0px)",
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
      fontFamily: "'Georgia', 'Times New Roman', serif", color: "#f0ebe0",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(160deg, #0a1a0d, #13301a)",
      }}>
        <button type="button" onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, padding: "8px 14px", color: "#a0d0a0",
          fontFamily: "'Courier New', monospace", fontSize: 13, cursor: "pointer", letterSpacing: 1,
        }}>‹ Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#5a8a5a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Your grow assistant</div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ margin: "auto", maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🌿</div>
            <div style={{ fontSize: 15, color: "#a0d0a0", marginBottom: 14, lineHeight: 1.6 }}>
              Ask anything about your grow, or tell me to do things - check off today's tasks, add to your daily notes. I know your full plan.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => setInput(s)} style={{
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, padding: "10px 12px", color: "#c8dcc8", fontSize: 13,
                  cursor: "pointer", textAlign: "left", fontFamily: "'Courier New', monospace",
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} actions={m.actions} />)}
        {busy && <Bubble role="assistant" text="thinking..." dim />}
        {error && (
          <div style={{ fontSize: 12.5, color: "#fca5a5", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "8px 10px" }}>{error}</div>
        )}
      </div>

      <div style={{
        padding: "10px 12px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex", gap: 8, alignItems: "flex-end",
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask about your grow..."
          style={{
            flex: 1, resize: "none", maxHeight: 120,
            background: "rgba(0,0,0,0.25)", color: "#e8f5e3",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
            padding: "10px 12px", fontSize: 14, lineHeight: 1.5,
            fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
          }}
        />
        <button type="button" onClick={send} disabled={busy || !input.trim()} style={{
          flexShrink: 0,
          background: busy || !input.trim() ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.18)",
          border: "1px solid rgba(34,197,94,0.35)", borderRadius: 10, padding: "10px 16px",
          color: "#4ade80", fontFamily: "'Courier New', monospace", fontSize: 13,
          cursor: busy || !input.trim() ? "default" : "pointer", letterSpacing: 1,
          opacity: !input.trim() ? 0.5 : 1,
        }}>
          {busy ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function Bubble({ role, text, dim, actions }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "82%", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14,
        padding: "10px 13px", borderRadius: 12,
        background: isUser ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isUser ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
        color: dim ? "#5a7a5a" : (isUser ? "#e8f5e3" : "#d6e6d6"),
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
      }}>{text}</div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "82%" }}>
          {actions.map((a, i) => (
            <span key={i} style={{
              fontSize: 11, fontFamily: "'Courier New', monospace",
              color: "#4ade80", background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "3px 8px",
            }}>
              {a.type === "append_note" ? "📝" : "✓"} {a.summary}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
