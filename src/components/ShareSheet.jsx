import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, RefreshCw, Trash2, Link } from "lucide-react";
import { api } from "../lib/api.js";

const MONO = "'Courier New', monospace";

export default function ShareSheet({ onClose }) {
  const [token, setToken] = useState(undefined); // undefined = loading
  const [createdAt, setCreatedAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getShareToken()
      .then(d => { setToken(d.token); setCreatedAt(d.createdAt); })
      .catch(() => setToken(null));
  }, []);

  const shareUrl = token ? `${window.location.origin}/share/${token}` : null;

  async function generate() {
    setBusy(true); setError("");
    try {
      const d = await api.createShareToken();
      setToken(d.token); setCreatedAt(d.createdAt);
    } catch (e) {
      setError(e.message || "Failed to generate link");
    } finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setError("");
    try {
      await api.deleteShareToken();
      setToken(null); setCreatedAt(null);
    } catch (e) {
      setError(e.message || "Failed to revoke");
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <>
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 320, restDelta: 0.5 }}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
          background: "var(--c-panel-bg)",
          borderTop: "1px solid var(--c-border)",
          borderRadius: "18px 18px 0 0",
          padding: "20px 18px calc(28px + env(safe-area-inset-bottom, 0px))",
        }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 4 }}>
          Buddy access
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--c-text)", marginBottom: 4, letterSpacing: -0.3 }}>
          Share your grow
        </div>
        <div style={{ fontSize: 12, color: "var(--c-text-faint)", fontFamily: MONO, marginBottom: 18, lineHeight: 1.7 }}>
          Anyone with the link can view your calendar and plan — read-only, no account needed. They can&apos;t edit, log, or see your notes.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#f87171", fontFamily: MONO, marginBottom: 12, padding: "8px 12px", background: "rgba(248,113,113,0.08)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)" }}>
            {error}
          </div>
        )}

        {token === undefined ? (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 2, padding: "12px 0" }}>LOADING…</div>
        ) : token ? (
          <>
            {/* URL display + copy */}
            <div style={{
              background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Link size={13} color="var(--c-accent)" strokeWidth={2} style={{ flexShrink: 0 }} />
              <span style={{
                flex: 1, fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                letterSpacing: 0.3,
              }}>
                {shareUrl}
              </span>
              <button
                type="button"
                className="touch-target"
                onClick={copy}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: copied ? "rgba(74,222,128,0.15)" : "var(--c-surface-2)",
                  border: `1px solid ${copied ? "rgba(74,222,128,0.4)" : "var(--c-border)"}`,
                  borderRadius: 7, padding: "6px 10px",
                  color: copied ? "var(--c-accent)" : "var(--c-text-dim)",
                  fontFamily: MONO, fontSize: 10, letterSpacing: 1, cursor: "pointer",
                  flexShrink: 0, transition: "all 0.15s",
                }}
              >
                {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={1.8} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {createdAt && (
              <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginBottom: 14, letterSpacing: 0.5 }}>
                Generated {new Date(createdAt).toLocaleDateString()}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="touch-target"
                onClick={generate}
                disabled={busy}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px", borderRadius: 10,
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11, letterSpacing: 1,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}
              >
                <RefreshCw size={12} strokeWidth={2} />
                New link
              </button>
              <button
                type="button"
                className="touch-target"
                onClick={revoke}
                disabled={busy}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px", borderRadius: 10,
                  background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)",
                  color: "#f87171", fontFamily: MONO, fontSize: 11, letterSpacing: 1,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}
              >
                <Trash2 size={12} strokeWidth={2} />
                Revoke
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(74,222,128,0.12)", border: "1.5px solid rgba(74,222,128,0.35)",
              color: "var(--c-accent)", fontFamily: MONO, fontSize: 12, letterSpacing: 1,
              cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1,
              marginBottom: 12,
            }}
          >
            <Link size={14} strokeWidth={2} />
            {busy ? "Generating…" : "Generate share link"}
          </button>
        )}

        <button
          type="button"
          className="touch-target"
          onClick={onClose}
          style={{
            width: "100%", padding: "13px", borderRadius: 12, marginTop: 10,
            background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer",
          }}
        >
          Close
        </button>
      </motion.div>
    </>
  );
}
