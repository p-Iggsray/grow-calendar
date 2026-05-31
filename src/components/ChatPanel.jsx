import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";

function fmtContextDate(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatPanel({ onClose, contextDate, suggestions }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const panelRef  = useRef(null); // outer fixed div — resized by visualViewport
  const bottomRef = useRef(null); // scroll anchor at end of message list
  const textareaRef = useRef(null);

  // Keep the panel sized to the visual viewport so the keyboard never covers the input.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      const el = panelRef.current;
      if (!el) return;
      el.style.height = vv.height + "px";
      el.style.top = vv.offsetTop + "px";
    }
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  // Scroll to the bottom anchor whenever messages change or busy toggles.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  // Reset textarea height when input is cleared after send.
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.getMjHistory().catch(() => ({ history: [] })),
      api.getMjUsage().catch(() => null),
    ]).then(([h, u]) => {
      if (!alive) return;
      setMessages(h.history ?? []);
      if (u) setUsage(u);
      setHistoryLoading(false);
    });
    return () => { alive = false; };
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const { reply, actions, usage: u } = await api.mj(text, contextDate ?? null);
      setMessages(prev => [...prev, { role: "assistant", content: reply, actions: actions || [] }]);
      if (u) setUsage(u);
    } catch (err) {
      const msg = err.status === 429
        ? (err.message || "Daily message limit reached. Try again tomorrow.")
        : (err.message || "Something went wrong. Try again.");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setMessages([]);
    setError("");
    api.clearMjHistory().catch(() => {});
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function onTextareaChange(e) {
    // Auto-grow up to 120px.
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    setInput(el.value);
  }

  return (
    <div
      ref={panelRef}
      style={{
        // visualViewport effect overrides top and height via ref.
        position: "fixed", top: 0, left: 0, right: 0, height: "100vh",
        zIndex: 50, background: "#0e1a12",
        display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        fontFamily: "'Georgia', 'Times New Roman', serif", color: "#f0ebe0",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(160deg, #0a1a0d, #13301a)",
        flexShrink: 0,
      }}>
        <button type="button" onClick={onClose} style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, padding: "10px 14px", color: "#a0d0a0",
          fontFamily: "'Courier New', monospace", fontSize: 13, cursor: "pointer", letterSpacing: 1,
          minHeight: 44,
        }}>‹ Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#5a8a5a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Your grow assistant</div>
            {contextDate && (
              <span style={{
                fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1,
                color: "#4ade80", background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.25)", borderRadius: 6, padding: "2px 7px",
              }}>
                📅 {fmtContextDate(contextDate)}
              </span>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: "none", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "5px 10px", color: "#5a7a5a",
              fontFamily: "'Courier New', monospace", fontSize: 10,
              letterSpacing: 1, cursor: "pointer", textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}
        <UsageBar usage={usage} />
      </div>

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 12,
        // Prevent scroll from bleeding through to the page behind the panel.
        overscrollBehavior: "contain",
        // Momentum scrolling on iOS.
        WebkitOverflowScrolling: "touch",
      }}>
        {historyLoading && (
          <div style={{ margin: "auto", fontFamily: "'Courier New', monospace", fontSize: 11, color: "#3a5a3a", letterSpacing: 2 }}>
            LOADING...
          </div>
        )}
        {!historyLoading && messages.length === 0 && (
          <div style={{ margin: "auto", maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🌿</div>
            <div style={{ fontSize: 15, color: "#a0d0a0", marginBottom: 14, lineHeight: 1.6 }}>
              Ask anything about your grow, or tell me to do things — check off today&apos;s tasks, add to your daily notes. I know your full plan.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(suggestions ?? []).map(s => (
                <button key={s} type="button" onClick={() => setInput(s)} style={{
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, padding: "12px 14px", color: "#c8dcc8", fontSize: 13,
                  cursor: "pointer", textAlign: "left", fontFamily: "'Courier New', monospace",
                  minHeight: 44,
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
        {/* Scroll anchor — scrollIntoView() targets this element */}
        <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* Input bar — pill composer */}
      <div style={{
        padding: "8px 12px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        background: "#0e1a12",
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 8,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.11)",
          borderRadius: 26, padding: "6px 6px 6px 16px",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask about your grow..."
            style={{
              flex: 1, resize: "none", maxHeight: 120,
              background: "none", border: "none", outline: "none",
              color: "#e8f5e3", fontSize: 16, lineHeight: 1.5,
              fontFamily: "'Georgia', 'Times New Roman', serif",
              padding: "5px 0",
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="Send"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
              background: input.trim() && !busy ? "#22c55e" : "rgba(34,197,94,0.1)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: input.trim() && !busy ? "pointer" : "default",
              transition: "background 0.2s",
            }}
          >
            {busy ? (
              <span style={{ fontSize: 15, color: "#4ade80" }}>…</span>
            ) : (
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path d="M8.5 14V3M8.5 3L4 7.5M8.5 3L13 7.5"
                  stroke={input.trim() ? "#0e1a12" : "#2a4a2a"}
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ usage }) {
  if (!usage) return null;
  const { count = 0, limit = 0, userCount, userLimit } = usage;
  const safeLimit = limit > 0 ? limit : 1;
  const pct = Math.min(100, Math.round((count / safeLimit) * 100));
  const color = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : "#4ade80";

  const showUserCap = typeof userCount === "number" && typeof userLimit === "number";
  const userPct = showUserCap ? Math.min(100, Math.round((userCount / userLimit) * 100)) : 0;
  const userColor = userPct >= 90 ? "#f87171" : userPct >= 70 ? "#fbbf24" : "#4ade80";

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {showUserCap && (
        <div title={`Your messages today: ${userCount} of ${userLimit}`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: userColor, letterSpacing: 1 }}>
            {userCount}/{userLimit}
          </span>
          <div style={{ width: 48, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${userPct}%`, height: "100%", background: userColor, transition: "width 0.3s, background 0.3s" }} />
          </div>
        </div>
      )}
      <div title={`Gemini API: ${count} of ${limit} calls used today`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#5a8a5a", letterSpacing: 1 }}>
          {count}/{limit}
        </span>
        <div style={{ width: 48, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s, background 0.3s" }} />
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, text, dim, actions }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "85%", whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 15,
        padding: "11px 14px", borderRadius: 18,
        background: isUser ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isUser ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
        color: dim ? "#5a7a5a" : (isUser ? "#e8f5e3" : "#d6e6d6"),
        borderBottomRightRadius: isUser ? 4 : 18,
        borderBottomLeftRadius: isUser ? 18 : 4,
      }}>{text}</div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "85%" }}>
          {actions.map((a, i) => (
            <span key={i} style={{
              fontSize: 11, fontFamily: "'Courier New', monospace",
              color: "#4ade80", background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "4px 9px",
            }}>
              {a.type === "append_note" ? "📝" : "✓"} {a.summary}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
