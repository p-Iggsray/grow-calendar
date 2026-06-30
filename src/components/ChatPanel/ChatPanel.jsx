import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Trash2, ArrowUp, Loader, Camera, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { MONO, SERIF } from "./constants.js";
import { fmtContextDate, compressImage } from "./helpers.js";
import ThreadStrip from "./ThreadStrip.jsx";
import Bubble from "./Bubble.jsx";
import { Skeleton } from "../Skeleton.jsx";

// When the daily message cap is hit, MJ "clocks out" with a bit of personality
// instead of showing a cold error. One line is picked at random each time.
const REST_LINES = [
  "I'm tired, boss… let me rest for the day. 😴",
  "Whew — that's all the brainpower I've got today. Catch me tomorrow. 🌙",
  "These leaves are wilting and so am I. Powering down 'til morning. 🌿💤",
  "My circuits need a nap, boss. Let's pick this back up tomorrow. 😴",
  "I've been in the garden all day. Time to rest — see you tomorrow! 🌱💤",
];
function pickRestLine() {
  return REST_LINES[Math.floor(Math.random() * REST_LINES.length)];
}

export default function ChatPanel({ onClose, contextDate, activeGrowId, grows, suggestions, onDataChanged }) {
  const [messages,       setMessages]      = useState([]);
  const [input,          setInput]         = useState("");
  const [busy,           setBusy]          = useState(false);
  const [error,          setError]         = useState("");
  const [resting,        setResting]       = useState("");
  const [historyLoading, setHistoryLoading]= useState(true);
  const [undoForMsgId,   setUndoForMsgId]  = useState(null);
  const [confirmClear,   setConfirmClear]  = useState(false);

  // Thread = which conversation thread is shown. Initialise to the active grow.
  const [threadGrowId, setThreadGrowId] = useState(() => activeGrowId ?? null);

  // Photo state
  const [imagePreview, setImagePreview] = useState(null); // data URL for display
  const [imageData,    setImageData]    = useState(null); // { data: base64, mimeType }

  const msgIdRef    = useRef(0);
  const undoTimerRef = useRef(null);
  const panelRef    = useRef(null);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef= useRef(null);

  // Visual viewport sizing so the keyboard never covers the input.
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
    if (!input && textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input]);

  // Reload history whenever the thread changes.
  useEffect(() => {
    let alive = true;
    setHistoryLoading(true);
    setMessages([]);
    api.getMjHistory(threadGrowId).catch(() => ({ history: [] })).then((h) => {
      if (!alive) return;
      setMessages(h.history ?? []);
      setHistoryLoading(false);
    });
    return () => { alive = false; };
  }, [threadGrowId]);

  const handlePhotoClick = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.target.value = "";
    try {
      const dataUrl = await compressImage(file);
      setImagePreview(dataUrl);
      const [header, b64] = dataUrl.split(",");
      const mimeType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      setImageData({ data: b64, mimeType });
    } catch { /* ignore compression errors */ }
  }, []);

  const clearImage = useCallback(() => {
    setImagePreview(null);
    setImageData(null);
  }, []);

  // `textOverride` lets suggestion chips send in one tap. The send button's
  // onClick passes a (non-string) event, so it correctly falls back to `input`.
  async function send(textOverride) {
    const text = (typeof textOverride === "string" ? textOverride : input).trim();
    if ((!text && !imageData) || busy) return;
    setBusy(true);
    setInput("");
    setError("");
    setResting("");
    const capturedPreview = imagePreview;
    const capturedImageData = imageData;
    setImagePreview(null);
    setImageData(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoForMsgId(null);

    const msgId = ++msgIdRef.current;
    setMessages(prev => [
      ...prev,
      { role: "user", content: text, imagePreview: capturedPreview },
      { role: "assistant", content: "", actions: [], _id: msgId },
    ]);
    try {
      await new Promise((resolve) => {
        api.mj(text, contextDate ?? null, {
          activeGrowId: activeGrowId ?? null,
          threadGrowId: threadGrowId ?? null,
          imageData: capturedImageData ?? null,
          onChunk: (delta) => {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, content: last.content + delta };
              return msgs;
            });
          },
          onDone: ({ actions }) => {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, actions: actions || [] };
              return msgs;
            });
            if ((actions || []).some(a => a.undoPayload)) {
              setUndoForMsgId(msgId);
              undoTimerRef.current = setTimeout(() => setUndoForMsgId(null), 60_000);
            }
            // MJ may have changed grow data (plants, dates, profile, tasks…).
            // Refresh the app's plan state so every tab reflects it immediately.
            if ((actions || []).length > 0) onDataChanged?.();
            resolve();
          },
          onError: (err) => {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
              return prev;
            });
            // Daily limit reached → MJ "clocks out" with a playful line rather
            // than a cold error. Everything else stays a normal error.
            if (err.status === 429) {
              setResting(pickRestLine());
            } else {
              setError(err.message || "Something went wrong. Try again.");
            }
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
      await api.mjUndo(undoPayload, activeGrowId);
    } catch { return; }
    setMessages(prev => prev.map(m => {
      if (m._id !== msgId) return m;
      const updated = (m.actions || []).map((a, i) =>
        i === actionIdx ? { ...a, undone: true } : a
      );
      return { ...m, actions: updated };
    }));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoForMsgId(null);
    onDataChanged?.();
  }

  function handleClear() {
    setMessages([]);
    setError("");
    setConfirmClear(false);
    api.clearMjHistory(threadGrowId).catch(() => {});
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function onTextareaChange(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
    setInput(el.value);
  }

  const showStrip = grows && grows.length > 0;
  const canSend = (input.trim() || imageData) && !busy;

  return (
    <motion.div
      ref={panelRef}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: "100vh",
        zIndex: 50, background: "var(--c-bg)",
        display: "flex", flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        fontFamily: SERIF, color: "var(--c-text)",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
        borderBottom: showStrip ? "none" : "1px solid var(--c-surface-2)",
        background: "var(--c-header-bg)",
        flexShrink: 0,
      }}>
        <button type="button" onClick={onClose} style={{
          background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
          borderRadius: 10, padding: "10px 14px", color: "var(--c-text-dim)",
          cursor: "pointer", minHeight: 44,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-muted)", textTransform: "uppercase" }}>MJ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.3 }}>
              {resting ? "Resting until tomorrow 😴" : "Your grow assistant"}
            </div>
            {contextDate && (
              <span style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: 1,
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
              <button type="button" className="touch-target" onClick={handleClear} style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "6px 10px", color: "var(--c-danger)",
                cursor: "pointer", fontSize: 11, fontFamily: MONO, letterSpacing: 0.5,
              }}>Clear</button>
              <button type="button" className="touch-target" onClick={() => setConfirmClear(false)} style={{
                background: "none", border: "1px solid var(--c-border)",
                borderRadius: 8, padding: "6px 10px", color: "var(--c-text-faint)",
                cursor: "pointer", fontSize: 11, fontFamily: MONO, letterSpacing: 0.5,
              }}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="touch-target" onClick={() => setConfirmClear(true)} aria-label="Clear conversation" style={{
              background: "none", border: "1px solid var(--c-border)",
              borderRadius: 8, padding: "8px 10px", color: "var(--c-text-faint)",
              cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center",
            }}>
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          )
        )}
      </div>

      {/* Thread strip */}
      {showStrip && (
        <ThreadStrip
          grows={grows}
          threadGrowId={threadGrowId}
          activeGrowId={activeGrowId}
          onSelect={(id) => {
            if (busy) return;
            setThreadGrowId(id);
            setError("");
            setResting("");
            setUndoForMsgId(null);
          }}
        />
      )}

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 12,
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}>
        {historyLoading && (
          <div role="status" aria-busy="true" aria-label="Loading conversation" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[{ me: false, w: "72%" }, { me: true, w: "55%" }, { me: false, w: "80%" }, { me: false, w: "40%" }].map((b, i) => (
              <div key={i} style={{ display: "flex", justifyContent: b.me ? "flex-end" : "flex-start" }}>
                <Skeleton width={b.w} height={b.me ? 38 : 56} radius={14} />
              </div>
            ))}
          </div>
        )}
        {!historyLoading && messages.length === 0 && (
          <div style={{ margin: "auto", maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🌿</div>
            <div style={{ fontSize: 15, color: "var(--c-text-dim)", marginBottom: 14, lineHeight: 1.6 }}>
              Ask anything about your grow — or send a photo for a diagnosis.
              I know your full plan, grow log, and current weather.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(suggestions ?? []).map(s => (
                <button key={s} type="button" onClick={() => send(s)} disabled={busy} style={{
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  borderRadius: 10, padding: "12px 14px", color: "var(--c-text-dim)", fontSize: 13,
                  cursor: "pointer", textAlign: "left", fontFamily: MONO, minHeight: 44,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isThinking = busy && i === messages.length - 1 && m.role === "assistant" && !m.content;
          return (
            <Bubble
              key={i}
              role={m.role}
              text={isThinking ? "thinking..." : m.content}
              dim={isThinking}
              imagePreview={m.imagePreview}
              actions={m.actions}
              showUndo={m._id != null && m._id === undoForMsgId}
              onUndo={(actionIdx, payload) => handleUndo(m._id, actionIdx, payload)}
            />
          );
        })}
        {resting && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            textAlign: "center", margin: "8px auto", maxWidth: 360,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            borderRadius: 14, padding: "18px 18px",
          }}>
            <div style={{ fontSize: 34 }}>😴</div>
            <div style={{ fontSize: 14.5, color: "var(--c-text-dim)", lineHeight: 1.6, fontFamily: SERIF }}>
              {resting}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
              Back tomorrow
            </div>
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12.5, color: "var(--c-danger-soft)", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "8px 10px" }}>{error}</div>
        )}
        <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} />
      </div>

      {/* Image preview above input */}
      {imagePreview && (
        <div style={{ padding: "6px 14px 0", flexShrink: 0 }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <img
              src={imagePreview}
              alt="Photo to send"
              style={{ height: 72, width: "auto", borderRadius: 8, objectFit: "cover", display: "block" }}
            />
            <button
              type="button"
              className="touch-target"
              onClick={clearImage}
              aria-label="Remove photo"
              style={{
                position: "absolute", top: -6, right: -6,
                width: 20, height: 20, borderRadius: "50%",
                background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for photos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* Input bar */}
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
          borderRadius: 26, padding: "6px 6px 6px 10px",
        }}>
          {/* Camera button */}
          <button
            type="button"
            className="touch-target"
            onClick={handlePhotoClick}
            aria-label="Attach photo"
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: "50%",
              background: imageData ? "rgba(74,222,128,0.15)" : "none",
              border: imageData ? "1px solid rgba(74,222,128,0.3)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: imageData ? "var(--c-accent)" : "var(--c-text-ghost)",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <Camera size={16} strokeWidth={1.8} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={imageData ? "Add a message (optional)…" : "Ask about your grow…"}
            style={{
              flex: 1, resize: "none", maxHeight: 120,
              background: "none", border: "none", outline: "none",
              color: "var(--c-text)", fontSize: 16, lineHeight: 1.5,
              fontFamily: SERIF, padding: "5px 0",
            }}
          />
          <button
            type="button"
            className="touch-target"
            onClick={send}
            disabled={!canSend}
            aria-label="Send"
            style={{
              flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
              background: canSend ? "#22c55e" : "rgba(34,197,94,0.1)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canSend ? "pointer" : "default",
              transition: "background 0.2s",
            }}
          >
            {busy ? (
              <Loader size={16} strokeWidth={2} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <ArrowUp size={17} strokeWidth={2.2} color={canSend ? "var(--c-bg)" : "var(--c-text-ghost)"} />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
