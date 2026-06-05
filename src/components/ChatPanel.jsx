import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Trash2, ArrowUp, Loader } from "lucide-react";
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
  // undoForMsgId: the _id of the message whose action chips show Undo buttons.
  // Cleared when a new send starts or when the 60s window expires.
  const [undoForMsgId, setUndoForMsgId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const msgIdRef    = useRef(0);    // monotonic counter for stable message IDs
  const undoTimerRef = useRef(null);

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
    setBusy(true);
    setInput("");
    setError("");
    // Sending a new message closes the previous undo window.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoForMsgId(null);

    // Assign a stable ID to the new assistant placeholder so the undo window
    // can reference it even after the messages array is mutated.
    const msgId = ++msgIdRef.current;
    // Append user message and an empty assistant placeholder immediately.
    // The placeholder shows "thinking..." until the first token arrives.
    setMessages(prev => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", actions: [], _id: msgId },
    ]);
    try {
      await new Promise((resolve) => {
        api.mj(text, contextDate ?? null, {
          onChunk: (delta) => {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = { ...last, content: last.content + delta };
              }
              return msgs;
            });
          },
          onDone: ({ actions, usage: u, modelUsed }) => {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") {
                msgs[msgs.length - 1] = { ...last, actions: actions || [] };
              }
              return msgs;
            });
            if (u) setUsage({ ...u, modelUsed });
            // Open the undo window if any action has an undoPayload.
            if ((actions || []).some(a => a.undoPayload)) {
              setUndoForMsgId(msgId);
              undoTimerRef.current = setTimeout(() => setUndoForMsgId(null), 60_000);
            }
            resolve();
          },
          onError: (err) => {
            setMessages(prev => {
              // Remove the empty placeholder if no text arrived before the error.
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
              return prev;
            });
            const msg = err.status === 429
              ? (err.message || "Daily message limit reached. Try again tomorrow.")
              : (err.message || "Something went wrong. Try again.");
            setError(msg);
            resolve();
          },
        });
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(msgId, actionIdx, undoPayload) {
    try {
      await api.mjUndo(undoPayload);
    } catch {
      // Undo failed silently — the chip reverts to normal on next render
      return;
    }
    // Mark the action undone and close the undo window.
    setMessages(prev => prev.map(m => {
      if (m._id !== msgId) return m;
      const updated = (m.actions || []).map((a, i) =>
        i === actionIdx ? { ...a, undone: true } : a
      );
      return { ...m, actions: updated };
    }));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoForMsgId(null);
  }

  function handleClear() {
    setMessages([]);
    setError("");
    setConfirmClear(false);
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
    <motion.div
      ref={panelRef}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 }}
      style={{
        // visualViewport effect overrides top and height via ref.
        position: "fixed", top: 0, left: 0, right: 0, height: "100vh",
        zIndex: 50, background: "var(--c-bg)",
        display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        fontFamily: "'Georgia', 'Times New Roman', serif", color: "var(--c-text)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderBottom: "1px solid var(--c-surface-2)",
        background: "linear-gradient(160deg, #0a1a0d, #13301a)",
        flexShrink: 0,
      }}>
        <button type="button" onClick={onClose} style={{
          background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
          borderRadius: 10, padding: "10px 14px", color: "#c0d4c0",
          cursor: "pointer", minHeight: 44,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#6aaa6a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Your grow assistant</div>
            {contextDate && (
              <span style={{
                fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1,
                color: "var(--c-accent)", background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.25)", borderRadius: 6, padding: "2px 7px",
              }}>
                📅 {fmtContextDate(contextDate)}
              </span>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          confirmClear ? (
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "6px 10px", color: "#f87171",
                  cursor: "pointer", fontSize: 11, fontFamily: "'Courier New', monospace", letterSpacing: 0.5,
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                style={{
                  background: "none", border: "1px solid var(--c-border)",
                  borderRadius: 8, padding: "6px 10px", color: "var(--c-text-faint)",
                  cursor: "pointer", fontSize: 11, fontFamily: "'Courier New', monospace", letterSpacing: 0.5,
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              aria-label="Clear conversation"
              style={{
                background: "none", border: "1px solid var(--c-border)",
                borderRadius: 8, padding: "8px 10px", color: "#5a7a5a",
                cursor: "pointer", flexShrink: 0,
                display: "flex", alignItems: "center",
              }}
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          )
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
          <div style={{ margin: "auto", fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 2 }}>
            LOADING...
          </div>
        )}
        {!historyLoading && messages.length === 0 && (
          <div style={{ margin: "auto", maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🌿</div>
            <div style={{ fontSize: 15, color: "var(--c-text-dim)", marginBottom: 14, lineHeight: 1.6 }}>
              Ask anything about your grow, or tell me to do things — check off today&apos;s tasks, add to your daily notes. I know your full plan.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(suggestions ?? []).map(s => (
                <button key={s} type="button" onClick={() => setInput(s)} style={{
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  borderRadius: 10, padding: "12px 14px", color: "var(--c-text-dim)", fontSize: 13,
                  cursor: "pointer", textAlign: "left", fontFamily: "'Courier New', monospace",
                  minHeight: 44,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          // While streaming, the last assistant message starts empty. Show
          // "thinking..." dimly until the first token fills it in.
          const isThinking = busy && i === messages.length - 1
            && m.role === "assistant" && !m.content;
          return (
            <Bubble
              key={i}
              role={m.role}
              text={isThinking ? "thinking..." : m.content}
              dim={isThinking}
              actions={m.actions}
              showUndo={m._id != null && m._id === undoForMsgId}
              onUndo={(actionIdx, payload) => handleUndo(m._id, actionIdx, payload)}
            />
          );
        })}
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
        borderTop: "1px solid var(--c-border-faint)",
        flexShrink: 0,
        background: "var(--c-bg)",
      }}>
        <div style={{
          display: "flex", alignItems: "flex-end", gap: 8,
          background: "var(--c-border-faint)",
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
              color: "var(--c-text)", fontSize: 16, lineHeight: 1.5,
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
              <Loader size={16} strokeWidth={2} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <ArrowUp size={17} strokeWidth={2.2} color={input.trim() ? "var(--c-bg)" : "var(--c-text-ghost)"} />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function UsageBar({ usage }) {
  if (!usage) return null;
  const { proCount, proLimit, flashCount = 0, flashLimit = 1500, userCount, userLimit, modelUsed } = usage;

  // Only show Pro bar if the user actually has access to Pro (non-zero limit and
  // at least one Pro call has been made, or one was just used).
  const usingPro = modelUsed?.includes("pro");
  const showPro = typeof proCount === "number" && typeof proLimit === "number" && (proCount > 0 || usingPro);
  const showUserCap = typeof userCount === "number" && typeof userLimit === "number";

  function bar(count, limit, label, dim) {
    const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
    const color = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : (dim ? "var(--c-text-faint)" : "var(--c-accent)");
    return (
      <div title={`${label}: ${count} of ${limit} today`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color, letterSpacing: 1 }}>
          {count}/{limit}
        </span>
        <div style={{ width: 48, height: 3, background: "var(--c-surface-2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s, background 0.3s" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {modelUsed && (
        <span style={{
          fontFamily: "'Courier New', monospace", fontSize: 9, letterSpacing: 1,
          color: usingPro ? "#a78bfa" : "#5a8a5a", textTransform: "uppercase",
        }}>
          {usingPro ? "◆ Pro" : "Flash"}
        </span>
      )}
      {showUserCap && bar(userCount, userLimit, "Your messages today", false)}
      {showPro && bar(proCount, proLimit, "Pro calls today", false)}
      {bar(flashCount, flashLimit, "Flash calls today", true)}
    </div>
  );
}

// Lightweight inline markdown renderer — handles **bold**, *italic*, `code`.
// Works alongside whiteSpace:pre-wrap so newlines are preserved naturally.
function MdInline({ text }) {
  const parts = [];
  let remaining = text;
  let k = 0;
  while (remaining.length > 0) {
    const bold   = /\*\*(.+?)\*\*/s.exec(remaining);
    const italic = /(?<!\*)\*([^*\n]+?)\*(?!\*)/.exec(remaining);
    const code   = /`([^`\n]+)`/.exec(remaining);
    const hits   = [
      bold   && { idx: bold.index,   match: bold,   type: "b" },
      italic && { idx: italic.index, match: italic, type: "i" },
      code   && { idx: code.index,   match: code,   type: "c" },
    ].filter(Boolean).sort((a, b) => a.idx - b.idx);
    if (!hits.length) { parts.push(remaining); break; }
    const { idx, match, type } = hits[0];
    if (idx > 0) parts.push(remaining.slice(0, idx));
    if (type === "b") parts.push(<strong key={k++} style={{ fontWeight: 700 }}>{match[1]}</strong>);
    else if (type === "i") parts.push(<em key={k++}>{match[1]}</em>);
    else parts.push(
      <code key={k++} style={{
        fontFamily: "'Courier New', monospace", fontSize: "0.88em",
        background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3,
      }}>{match[1]}</code>
    );
    remaining = remaining.slice(idx + match[0].length);
  }
  return <>{parts}</>;
}

function Bubble({ role, text, dim, actions, showUndo, onUndo }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "85%", whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 15,
        padding: "11px 14px", borderRadius: 18,
        background: isUser ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isUser ? "rgba(34,197,94,0.3)" : "var(--c-surface-2)"}`,
        color: dim ? "var(--c-text-faint)" : (isUser ? "var(--c-text)" : "var(--c-text-dim)"),
        borderBottomRightRadius: isUser ? 4 : 18,
        borderBottomLeftRadius: isUser ? 18 : 4,
      }}>
        {isUser || dim ? text : <MdInline text={text} />}
      </div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "85%" }}>
          {actions.map((a, i) => {
            if (a.undone) {
              return (
                <span key={i} style={{
                  fontSize: 11, fontFamily: "'Courier New', monospace",
                  color: "#5a7a5a", background: "var(--c-surface-1)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8, padding: "4px 9px",
                }}>
                  ↩ Undone
                </span>
              );
            }
            const isNote = a.type === "replace_note";
            const canUndo = showUndo && !!a.undoPayload;
            return (
              <span key={i} style={{
                fontSize: 11, fontFamily: "'Courier New', monospace",
                color: isNote ? "#fbbf24" : "var(--c-accent)",
                background: isNote ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                border: `1px solid ${isNote ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                borderRadius: 8, padding: "4px 9px",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {a.type === "replace_note" ? "✏️" : a.type === "append_note" ? "📝" : "✓"} {a.summary}
                {canUndo && (
                  <button
                    type="button"
                    onClick={() => onUndo(i, a.undoPayload)}
                    style={{
                      background: "none", border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 5, color: "rgba(255,255,255,0.45)", fontSize: 10,
                      fontFamily: "'Courier New', monospace", letterSpacing: 0.5,
                      padding: "1px 6px", cursor: "pointer", lineHeight: 1.4,
                    }}
                  >
                    Undo
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
