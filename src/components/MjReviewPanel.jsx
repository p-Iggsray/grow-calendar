import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, Loader } from "lucide-react";
import { api } from "../lib/api.js";

const TRIGGER_MSG = "Begin your review of my grow plan.";

export default function MjReviewPanel({ onComplete, onSkip }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewSummary, setReviewSummary] = useState("");
  const [phaseActions, setPhaseActions] = useState([]);

  const msgIdRef       = useRef(0);
  const conversationRef = useRef([]); // clean [{role, content}] for API
  const autoStartedRef  = useRef(false);
  const panelRef        = useRef(null);
  const bottomRef       = useRef(null);
  const textareaRef     = useRef(null);

  // Resize panel to visual viewport so keyboard never covers the input bar.
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  const doSend = useCallback(async (userText) => {
    const trimmed = userText.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setInput("");
    setErrorMsg("");

    const msgId = ++msgIdRef.current;

    // Append user turn to the clean conversation for the API.
    conversationRef.current = [...conversationRef.current, { role: "user", content: trimmed }];

    // Update display: add user bubble + empty assistant placeholder.
    // The trigger message is NOT shown as a visible user bubble.
    const isHiddenTrigger = trimmed === TRIGGER_MSG;
    setMessages(prev => [
      ...prev,
      ...(isHiddenTrigger ? [] : [{ role: "user", content: trimmed }]),
      { role: "assistant", content: "", _id: msgId },
    ]);

    const apiHistory = [...conversationRef.current];

    await new Promise(resolve => {
      api.mjReview(apiHistory, {
        onChunk: (delta) => {
          setMessages(prev => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant" && last._id === msgId) {
              msgs[msgs.length - 1] = { ...last, content: last.content + delta };
            }
            return msgs;
          });
        },
        onDone: ({ actions }) => {
          // Capture the final assistant text into the clean conversation.
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last._id === msgId) {
              conversationRef.current = [
                ...conversationRef.current,
                { role: "assistant", content: last.content },
              ];
            }
            return prev;
          });

          const improved = (actions || []).filter(a => a.type === "phase_improved");
          if (improved.length > 0) {
            setPhaseActions(prev => [...prev, ...improved]);
          }

          const doneAction = (actions || []).find(a => a.type === "review_complete");
          if (doneAction) {
            setReviewDone(true);
            setReviewSummary(doneAction.summary || "Plan improvements applied.");
            // Reload plan so the latest phase overrides show in the Plan tab.
            resolve();
          } else {
            resolve();
          }
        },
        onError: (err) => {
          // Remove empty placeholder if no text arrived.
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last._id === msgId && !last.content) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          const msg = err.status === 429
            ? "AI quota reached. Please try again later."
            : (err.message || "Something went wrong.");
          setErrorMsg(msg);
          resolve();
        },
      });
    });

    setBusy(false);
  }, [busy]);

  // Auto-start on mount.
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    doSend(TRIGGER_MSG);
  }, [doSend]);

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(input); }
  }

  function onTextareaChange(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    setInput(el.value);
  }

  const visibleMessages = messages.filter(m => m.content || (m.role === "assistant" && busy && m._id === Math.max(...messages.map(x => x._id ?? 0))));

  return (
    <div
      ref={panelRef}
      style={{
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
        <button
          type="button"
          onClick={onSkip}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "10px 14px", color: "#a0d0a0",
            cursor: "pointer", minHeight: 44,
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 1 }}>Skip</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#5a8a5a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>
            Plan Quality Review
          </div>
        </div>
        {phaseActions.length > 0 && (
          <span style={{
            fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1,
            color: "#4ade80", background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.25)", borderRadius: 6, padding: "3px 8px",
          }}>
            {phaseActions.length} improved
          </span>
        )}
      </div>

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 12,
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}>
        {/* Intro card shown before any messages arrive */}
        {visibleMessages.length === 0 && !busy && (
          <div style={{ margin: "auto", maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🌱</div>
            <div style={{ fontSize: 15, color: "#a0d0a0", lineHeight: 1.6 }}>
              MJ is reviewing your generated plan and will ask a few targeted questions to improve it for your specific conditions.
            </div>
          </div>
        )}

        {visibleMessages.length === 0 && busy && (
          <div style={{ margin: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <Loader size={14} strokeWidth={2} color="#4ade80" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: "#3a5a3a", letterSpacing: 2 }}>
              ANALYZING PLAN
            </span>
          </div>
        )}

        {visibleMessages.map((m, i) => {
          const isThinking = busy && i === visibleMessages.length - 1
            && m.role === "assistant" && !m.content;
          return (
            <ReviewBubble
              key={i}
              role={m.role}
              text={isThinking ? "thinking..." : m.content}
              dim={isThinking}
            />
          );
        })}

        {errorMsg && (
          <div style={{
            fontSize: 12.5, color: "#fca5a5",
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
            borderRadius: 8, padding: "8px 10px",
          }}>{errorMsg}</div>
        )}

        {/* Review complete CTA */}
        {reviewDone && (
          <div style={{
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
            borderRadius: 14, padding: "16px 18px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 14, color: "#a0d0a0", lineHeight: 1.6, marginBottom: 14 }}>
              {reviewSummary}
            </div>
            {phaseActions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 14 }}>
                {phaseActions.map((a, i) => (
                  <span key={i} style={{
                    fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 0.5,
                    color: "#4ade80", background: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    borderRadius: 6, padding: "3px 8px",
                  }}>✓ {a.summary}</span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onComplete}
              style={{
                background: "#22c55e", border: "none", borderRadius: 12,
                padding: "12px 24px", color: "#0e1a12",
                fontFamily: "'Courier New', monospace", fontSize: 13,
                fontWeight: 700, letterSpacing: 1, cursor: "pointer",
                minHeight: 44,
              }}
            >
              VIEW MY IMPROVED PLAN →
            </button>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* Input bar — hidden once review is done */}
      {!reviewDone && (
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
              placeholder={busy ? "MJ is thinking..." : "Answer MJ's question…"}
              disabled={busy}
              style={{
                flex: 1, resize: "none", maxHeight: 120,
                background: "none", border: "none", outline: "none",
                color: busy ? "#3a5a3a" : "#e8f5e3", fontSize: 16, lineHeight: 1.5,
                fontFamily: "'Georgia', 'Times New Roman', serif",
                padding: "5px 0",
              }}
            />
            <button
              type="button"
              onClick={() => doSend(input)}
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
                <Loader size={16} strokeWidth={2} color="#4ade80" style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#0e1a12" : "#2a4a2a"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewBubble({ role, text, dim }) {
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
    </div>
  );
}
