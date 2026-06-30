import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Users, FileText, Bell, BellOff, BarChart2, Sun, Moon, Monitor, Map, Share2, SlidersHorizontal, Gauge } from "lucide-react";
import ShareSheet from "./ShareSheet.jsx";
import PhaseLegend from "./PhaseLegend.jsx";
import ThreatsReference from "./ThreatsReference.jsx";
import AuthFooter from "./AuthFooter.jsx";
import { usePlan } from "../lib/usePlan.jsx";
import { growLocation, strainSummary } from "../lib/growProfile.js";
import { useNotifications } from "../lib/useNotifications.js";
import { useToast } from "../lib/useToast.jsx";
import { api } from "../lib/api.js";

const THEME_OPTIONS = [
  { value: "auto",  label: "Auto",  Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark",  label: "Dark",  Icon: Moon },
];

export default function MoreScreen({ isAdmin, onOpenAdmin, onOpenStats, onOpenMap, onOpenEnv, onOpenSettings, onBeforeSignOut, theme, setTheme }) {
  const { survey, activeGrowId } = usePlan();
  const location = growLocation(survey);
  const strains = strainSummary(survey);
  const [showShare, setShowShare] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const { addToast } = useToast();
  const { supported: notifSupported, permission, subscribed, busy: notifBusy, error: notifError, subscribe, unsubscribe } = useNotifications();

  // Downloads the full, print-ready grow report as a self-contained HTML file
  // (it has a built-in "Save as PDF / Print" button). We fetch + save rather
  // than navigating to the URL: this is an installed standalone PWA (scope "/"),
  // so a same-origin window.open is captured by the app window and replaces the
  // running app — which looked like a hard refresh. Requires an active grow.
  async function openReport() {
    if (!activeGrowId || reportBusy) return;
    setReportBusy(true);
    try {
      const html = await api.getGrowReport(activeGrowId);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grow-report-${activeGrowId}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      addToast(`Could not export report: ${err?.message ?? "unknown error"}`);
    } finally {
      setReportBusy(false);
    }
  }
  return (
    <div style={{
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
    }}>
      <div style={{
        paddingBottom: 14,
        marginBottom: 8,
        borderBottom: "1px solid var(--c-border-faint)",
      }}>
        <div style={{
          fontSize: 11, letterSpacing: 4, color: "var(--c-text-ghost)",
          textTransform: "uppercase", marginBottom: 4,
          fontFamily: "'Courier New', monospace",
        }}>
          Grow Log{location ? ` · ${location}` : ""}
        </div>
        {strains && (
          <div style={{ fontSize: 11, color: "var(--c-text-faint)", fontFamily: "'Courier New', monospace" }}>
            {strains}
          </div>
        )}
      </div>

      <PhaseLegend />
      <ThreatsReference />

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          disabled={!activeGrowId}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: activeGrowId ? "pointer" : "default",
            color: activeGrowId ? "var(--c-text-dim)" : "var(--c-text-ghost)",
            fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
            opacity: activeGrowId ? 1 : 0.6,
            transition: "opacity 0.15s",
          }}
        >
          <SlidersHorizontal size={16} strokeWidth={1.8} />
          Grow settings &amp; dates
        </button>
      </div>

      {isAdmin && (
        <div style={{ padding: "12px 0 0" }}>
          <button
            type="button"
            onClick={onOpenAdmin}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              width: "100%", padding: "14px 16px",
              background: "var(--c-surface-1)",
              border: "1px solid var(--c-border)",
              borderRadius: 12, cursor: "pointer",
              color: "var(--c-text-dim)", fontFamily: "'Courier New', monospace",
              fontSize: 13, letterSpacing: 1,
            }}
          >
            <Users size={16} strokeWidth={1.8} />
            Manage Members
          </button>
        </div>
      )}

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={onOpenStats}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: "pointer",
            color: "var(--c-text-dim)", fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
          }}
        >
          <BarChart2 size={16} strokeWidth={1.8} />
          Season Analytics
        </button>
      </div>

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={onOpenEnv}
          disabled={!activeGrowId}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: activeGrowId ? "pointer" : "default",
            color: activeGrowId ? "var(--c-text-dim)" : "var(--c-text-ghost)",
            fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
            opacity: activeGrowId ? 1 : 0.6,
          }}
        >
          <Gauge size={16} strokeWidth={1.8} />
          Environment &amp; sensor import
        </button>
      </div>

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={onOpenMap}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: "pointer",
            color: "var(--c-text-dim)", fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
          }}
        >
          <Map size={16} strokeWidth={1.8} />
          Garden Map
        </button>
      </div>

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={() => setShowShare(true)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: "pointer",
            color: "var(--c-text-dim)", fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
          }}
        >
          <Share2 size={16} strokeWidth={1.8} />
          Share grow with buddy
        </button>
      </div>

      <AnimatePresence>
        {showShare && <ShareSheet key="share" onClose={() => setShowShare(false)} />}
      </AnimatePresence>

      <div style={{ padding: "12px 0 0" }}>
        <button
          type="button"
          onClick={openReport}
          disabled={!activeGrowId || reportBusy}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: activeGrowId && !reportBusy ? "pointer" : "default",
            color: activeGrowId ? "var(--c-text-dim)" : "var(--c-text-ghost)",
            fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
            opacity: activeGrowId && !reportBusy ? 1 : 0.6,
            transition: "opacity 0.15s",
          }}
        >
          <FileText size={16} strokeWidth={1.8} />
          {reportBusy ? "Preparing report…" : "Export full grow report"}
        </button>
      </div>

      {notifSupported && (
        <div style={{ padding: "12px 0 0" }}>
          <button
            type="button"
            onClick={subscribed ? unsubscribe : subscribe}
            disabled={notifBusy || permission === "denied"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "14px 16px",
              background: "var(--c-surface-1)",
              border: "1px solid var(--c-border)",
              borderRadius: 12,
              cursor: notifBusy || permission === "denied" ? "default" : "pointer",
              color: permission === "denied" ? "var(--c-text-faint)" : "var(--c-text-dim)",
              fontFamily: "'Courier New', monospace",
              fontSize: 13, letterSpacing: 1,
              opacity: notifBusy ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {subscribed
                ? <Bell size={16} strokeWidth={1.8} />
                : <BellOff size={16} strokeWidth={1.8} />}
              {notifBusy
                ? "Working..."
                : subscribed
                  ? "Daily reminders on"
                  : permission === "denied"
                    ? "Notifications blocked"
                    : "Enable daily reminders"}
            </span>
            <span style={{
              fontSize: 11, letterSpacing: 1,
              color: subscribed ? "var(--c-accent)" : "var(--c-text-ghost)",
            }}>
              {subscribed ? "ON" : "OFF"}
            </span>
          </button>
          {permission === "denied" && (
            <div style={{
              fontSize: 11, color: "var(--c-text-faint)", marginTop: 4, paddingLeft: 4,
              fontFamily: "'Courier New', monospace",
            }}>
              Notifications are blocked — allow them in your browser settings
            </div>
          )}
          {notifError && (
            <div style={{
              fontSize: 11, color: "var(--c-danger-soft)", marginTop: 4, paddingLeft: 4,
              fontFamily: "'Courier New', monospace",
            }}>
              {notifError}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "12px 0 0" }}>
        <div style={{
          fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)",
          fontFamily: "'Courier New', monospace", textTransform: "uppercase",
          marginBottom: 8,
        }}>
          Appearance
        </div>
        <div style={{
          display: "flex", borderRadius: 12, overflow: "hidden",
          border: "1px solid var(--c-border)",
        }}>
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                style={{
                  flex: 1, padding: "12px 4px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                  background: active ? "var(--c-accent)" : "var(--c-surface-1)",
                  border: "none",
                  borderRight: value !== "dark" ? "1px solid var(--c-border)" : "none",
                  color: active ? "var(--c-bg)" : "var(--c-text-dim)",
                  fontFamily: "'Courier New', monospace",
                  fontSize: 11, letterSpacing: 1,
                  cursor: "pointer",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.6} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--c-surface-2)", fontFamily: "'Courier New', monospace" }}>
        <p style={{ fontSize: 10, lineHeight: 1.6, color: "var(--c-text-faint)", margin: 0 }}>
          For educational and personal record-keeping only — not medical, legal, or professional cultivation advice. You are responsible for complying with the cannabis laws in your area. Your data is stored privately and never sold; AI features send your grow details to Google&apos;s Gemini API. Contact the admin to delete your account and data.
        </p>
      </div>

      <AuthFooter onBeforeSignOut={onBeforeSignOut} />
    </div>
  );
}
