import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Trash2, ArrowUp, Loader, Camera, X } from "lucide-react";
import { api } from "../lib/api.js";

const MONO  = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";

function fmtContextDate(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Compress an image File to a JPEG data URL at max 1200px on the longest side.
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const MAX_PX = 1200;
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Horizontal scrollable thread pill strip — one pill per grow + "General".
function ThreadStrip({ grows, threadGrowId, activeGrowId, onSelect }) {
  const threads = [
    { id: null, label: "General" },
    ...grows.map(g => ({
      id: g.id,
      label: g.displayName?.slice(0, 16) || "Grow",
      isCalendarActive: g.id === activeGrowId,
    })),
  ];

  return (
    <div style={{
      display: "flex", gap: 6, overflowX: "auto", padding: "8px 14px",
      scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      borderBottom: "1px solid var(--c-border-faint)", flexShrink: 0,
    }}>
      {threads.map(t => {
        const isSelected = t.id === threadGrowId;
        return (
          <button
            key={t.id ?? "__general__"}
            type="button"
            onClick={() => { if (!isSelected) onSelect(t.id); }}
            style={{
              flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 20, minHeight: 34,
              background: isSelected ? "rgba(74,222,128,0.18)" : "var(--c-surface-1)",
              border: `1px solid ${isSelected ? "rgba(74,222,128,0.45)" : "var(--c-border)"}`,
              color: isSelected ? "var(--c-accent)" : "var(--c-text-muted)",
              fontFamily: MONO, fontSize: 10, letterSpacing: 0.8,
              cursor: isSelected ? "default" : "pointer",
              transition: "background 0.15s, border-color 0.15s, color 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {t.isCalendarActive && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0 }} />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ChatPanel({ onClose, contextDate, activeGrowId, grows, suggestions }) {
  const [messages,       setMessages]      = useState([]);
  const [input,          setInput]         = useState("");
  const [busy,           setBusy]          = useState(false);
  const [error,          setError]         = useState("");
  const [usage,          setUsage]         = useState(null);
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

  // Reload history + usage whenever the thread changes.
  useEffect(() => {
    let alive = true;
    setHistoryLoading(true);
    setMessages([]);
    Promise.all([
      api.getMjHistory(threadGrowId).catch(() => ({ history: [] })),
      api.getMjUsage().catch(() => null),
    ]).then(([h, u]) => {
      if (!alive) return;
      setMessages(h.history ?? []);
      if (u) setUsage(u);
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

  async function send() {
    const text = input.trim();
    if ((!text && !imageData) || busy) return;
    setBusy(true);
    setInput("");
    setError("");
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
          onDone: ({ actions, usage: u, modelUsed }) => {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === "assistant") msgs[msgs.length - 1] = { ...last, actions: actions || [] };
              return msgs;
            });
            if (u) setUsage({ ...u, modelUsed });
            if ((actions || []).some(a => a.undoPayload)) {
              setUndoForMsgId(msgId);
              undoTimerRef.current = setTimeout(() => setUndoForMsgId(null), 60_000);
            }
            resolve();
          },
          onError: (err) => {
            setMessages(prev => {
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
          <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: "#6aaa6a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Your grow assistant</div>
            {contextDate && (
              <span style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
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
              <button type="button" onClick={handleClear} style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8, padding: "6px 10px", color: "#f87171",
                cursor: "pointer", fontSize: 11, fontFamily: MONO, letterSpacing: 0.5,
              }}>Clear</button>
              <button type="button" onClick={() => setConfirmClear(false)} style={{
                background: "none", border: "1px solid var(--c-border)",
                borderRadius: 8, padding: "6px 10px", color: "var(--c-text-faint)",
                cursor: "pointer", fontSize: 11, fontFamily: MONO, letterSpacing: 0.5,
              }}>Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} aria-label="Clear conversation" style={{
              background: "none", border: "1px solid var(--c-border)",
              borderRadius: 8, padding: "8px 10px", color: "#5a7a5a",
              cursor: "pointer", flexShrink: 0,
              display: "flex", alignItems: "center",
            }}>
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          )
        )}
        <UsageBar usage={usage} />
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
          <div style={{ margin: "auto", fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 2 }}>
            LOADING...
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
                <button key={s} type="button" onClick={() => setInput(s)} style={{
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
        {error && (
          <div style={{ fontSize: 12.5, color: "#fca5a5", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 8, padding: "8px 10px" }}>{error}</div>
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

function UsageBar({ usage }) {
  if (!usage) return null;
  const { proCount, proLimit, flashCount = 0, flashLimit = 1500, userCount, userLimit, modelUsed } = usage;
  const usingPro = modelUsed?.includes("pro");
  const showPro = typeof proCount === "number" && typeof proLimit === "number" && (proCount > 0 || usingPro);
  const showUserCap = typeof userCount === "number" && typeof userLimit === "number";

  function bar(count, limit, label, dim) {
    const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
    const color = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : (dim ? "var(--c-text-faint)" : "var(--c-accent)");
    return (
      <div title={`${label}: ${count} of ${limit} today`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color, letterSpacing: 1 }}>{count}/{limit}</span>
        <div style={{ width: 48, height: 3, background: "var(--c-surface-2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s, background 0.3s" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {modelUsed && (
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: usingPro ? "#a78bfa" : "#5a8a5a", textTransform: "uppercase" }}>
          {usingPro ? "◆ Pro" : "Flash"}
        </span>
      )}
      {showUserCap && bar(userCount, userLimit, "Your messages today", false)}
      {showPro && bar(proCount, proLimit, "Pro calls today", false)}
      {bar(flashCount, flashLimit, "Flash calls today", true)}
    </div>
  );
}

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
      <code key={k++} style={{ fontFamily: MONO, fontSize: "0.88em", background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>{match[1]}</code>
    );
    remaining = remaining.slice(idx + match[0].length);
  }
  return <>{parts}</>;
}

function Bubble({ role, text, dim, imagePreview, actions, showUndo, onUndo }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      {/* Photo thumbnail in user bubble */}
      {isUser && imagePreview && (
        <img
          src={imagePreview}
          alt="Attached photo"
          style={{
            maxHeight: 220, maxWidth: "85%", borderRadius: 12,
            objectFit: "contain", marginBottom: text ? 4 : 0, display: "block",
          }}
        />
      )}
      {/* Only render text bubble if there's text content */}
      {(text || !imagePreview || !isUser) && (
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
      )}
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "85%" }}>
          {actions.map((a, i) => {
            if (a.undone) {
              return (
                <span key={i} style={{
                  fontSize: 11, fontFamily: MONO, color: "#5a7a5a",
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  borderRadius: 8, padding: "4px 9px",
                }}>↩ Undone</span>
              );
            }
            const isNote = a.type === "replace_note";
            const canUndo = showUndo && !!a.undoPayload;
            return (
              <span key={i} style={{
                fontSize: 11, fontFamily: MONO,
                color: isNote ? "#fbbf24" : "var(--c-accent)",
                background: isNote ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                border: `1px solid ${isNote ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                borderRadius: 8, padding: "4px 9px",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {a.type === "replace_note" ? "✏️"
                  : a.type === "append_note" ? "📝"
                  : a.type === "update_grow_info" ? "🌿"
                  : a.type === "update_grow_dates" ? "📅"
                  : a.type === "update_phase_tasks" ? "📋"
                  : "✓"} {a.summary}
                {canUndo && (
                  <button
                    type="button"
                    onClick={() => onUndo(i, a.undoPayload)}
                    style={{
                      background: "none", border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 5, color: "rgba(255,255,255,0.45)", fontSize: 10,
                      fontFamily: MONO, letterSpacing: 0.5,
                      padding: "1px 6px", cursor: "pointer", lineHeight: 1.4,
                    }}
                  >Undo</button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
