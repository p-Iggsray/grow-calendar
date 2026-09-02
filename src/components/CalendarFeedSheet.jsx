import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import Portal from "./Portal.jsx";

const UI = "var(--font-ui)";

// Subscribing to your reminders in the phone's own calendar, which is what
// makes them actually notify you. The app cannot raise a notification on its
// own; iOS can, and will, for a calendar it has subscribed to.
export default function CalendarFeedSheet({ onClose }) {
  const [token, setToken] = useState(undefined); // undefined = still loading
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCalendarToken()
      .then((d) => setToken(d.token))
      .catch(() => setToken(null));
  }, []);

  const url = token ? `${window.location.origin}/api/calendar/${token}.ics` : null;
  // webcal:// is what makes a phone offer to subscribe rather than download.
  const webcal = url ? url.replace(/^https?:/, "webcal:") : null;

  async function generate() {
    setBusy(true); setError("");
    try {
      const d = await api.createCalendarToken();
      setToken(d.token);
    } catch (e) {
      setError(e?.message || "Could not create the feed.");
    } finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setError("");
    try {
      await api.deleteCalendarToken();
      setToken(null);
    } catch (e) {
      setError(e?.message || "Could not turn it off.");
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 90,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end",
        }}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Calendar feed"
          onClick={(e) => e.stopPropagation()}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300, restDelta: 0.5 }}
          style={{
            width: "100%", maxHeight: "88vh", overflowY: "auto",
            background: "var(--c-panel-bg)",
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            border: "1px solid var(--c-border-strong)", borderBottom: "none",
            padding: "8px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
          }}>
          <div aria-hidden="true" style={{
            width: 38, height: 4, borderRadius: 2, margin: "4px auto 14px",
            background: "var(--c-border-strong)",
          }} />

          <div style={{ fontFamily: UI, fontSize: 17, fontWeight: 800, color: "var(--c-text)", marginBottom: 6 }}>
            Reminders in your calendar
          </div>
          <p style={{ fontFamily: UI, fontSize: 12.5, lineHeight: 1.7, color: "var(--c-text-muted)", margin: "0 0 16px" }}>
            This app cannot buzz your phone by itself. Subscribe to this feed in
            your phone&rsquo;s Calendar and every reminder you set here shows up
            there, with real alerts, on every device you&rsquo;re signed into.
          </p>

          {token === undefined && (
            <div style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-ghost)" }}>Loading…</div>
          )}

          {token === null && (
            <button
              type="button"
              className="touch-target"
              onClick={generate}
              disabled={busy}
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 12,
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)",
                color: "var(--c-accent)", fontFamily: UI, fontSize: 13.5, fontWeight: 700,
                cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
              }}>
              {busy ? "Creating…" : "Create my calendar feed"}
            </button>
          )}

          {token && (
            <>
              <div style={{
                fontFamily: "var(--font-num)", fontSize: 11.5, lineHeight: 1.6,
                color: "var(--c-text-dim)", wordBreak: "break-all",
                background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                borderRadius: 10, padding: "10px 12px", marginBottom: 10,
              }}>
                {url}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <button
                  type="button"
                  className="touch-target"
                  onClick={copy}
                  style={{
                    flex: 1, padding: "11px 12px", borderRadius: 11,
                    background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)",
                    color: "var(--c-accent)", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  href={webcal}
                  className="touch-target"
                  style={{
                    flex: 1, padding: "11px 12px", borderRadius: 11,
                    background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
                    color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5, fontWeight: 650,
                    textDecoration: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  Subscribe now
                </a>
              </div>

              <div style={{
                fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.4,
                textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 8,
              }}>
                On an iPhone
              </div>
              <ol style={{
                fontFamily: UI, fontSize: 12.5, lineHeight: 1.8, color: "var(--c-text-muted)",
                margin: "0 0 16px", paddingLeft: 20,
              }}>
                <li>Tap <strong style={{ color: "var(--c-text-dim)" }}>Subscribe now</strong>, or copy the link and go to Settings, Apps, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar.</li>
                <li>In that subscription, turn <strong style={{ color: "var(--c-text-dim)" }}>Remove Alerts</strong> off. Leave it on and iOS strips the alarms, which is the whole point of this.</li>
              </ol>

              <p style={{ fontFamily: UI, fontSize: 11.5, lineHeight: 1.7, color: "var(--c-text-ghost)", margin: "0 0 16px" }}>
                Your phone refreshes a subscribed calendar every so often rather
                than instantly, so set reminders a little ahead rather than for
                five minutes from now. Anyone with this link can read your
                reminders, so keep it to yourself.
              </p>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="touch-target"
                  onClick={generate}
                  disabled={busy}
                  style={{
                    flex: 1, padding: "11px 12px", borderRadius: 11,
                    background: "none", border: "1px solid var(--c-border-strong)",
                    color: "var(--c-text-muted)", fontFamily: UI, fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <RefreshCw size={13} strokeWidth={2} /> New link
                </button>
                <button
                  type="button"
                  className="touch-target"
                  onClick={revoke}
                  disabled={busy}
                  style={{
                    flex: 1, padding: "11px 12px", borderRadius: 11,
                    background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)",
                    color: "var(--c-danger-soft)", fontFamily: UI, fontSize: 12, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  <Trash2 size={13} strokeWidth={2} /> Turn off
                </button>
              </div>
            </>
          )}

          {error && (
            <div role="status" style={{ fontFamily: UI, fontSize: 12, color: "var(--c-danger-soft)", marginTop: 12, lineHeight: 1.6 }}>
              {error}
            </div>
          )}
        </motion.div>
      </motion.div>
    </Portal>
  );
}
