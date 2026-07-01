import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Users, FileText, Bell, BellOff, BarChart2, Sun, Moon, Monitor, Map, Share2, SlidersHorizontal, Gauge, ChevronRight } from "lucide-react";
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

// iOS-settings-style row: tinted icon square, label, trailing detail + chevron.
function Row({ icon: Icon, tint, label, detail, onClick, disabled, last, trailing }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "12px 14px",
        background: "none", border: "none",
        borderBottom: last ? "none" : "1px solid var(--c-border-faint)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        font: "inherit", textAlign: "left",
        minHeight: 52,
      }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${tint}1f`, color: tint,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "var(--c-text)" }}>{label}</span>
      {detail && <span style={{ fontSize: 13, color: "var(--c-text-faint)" }}>{detail}</span>}
      {trailing ?? <ChevronRight size={17} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />}
    </button>
  );
}

function Group({ title, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      {title && (
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
          color: "var(--c-text-faint)", margin: "0 4px 7px",
        }}>
          {title}
        </div>
      )}
      <div className="card" style={{ overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

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
      {/* Large title */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.7, color: "var(--c-text)" }}>More</div>
        <div style={{ fontSize: 12.5, color: "var(--c-text-faint)", marginTop: 3 }}>
          {location || "Your grow"}{strains ? ` · ${strains}` : ""}
        </div>
      </div>

      <Group title="This grow">
        <Row icon={SlidersHorizontal} tint="#4ade80" label="Grow settings & dates" onClick={onOpenSettings} disabled={!activeGrowId} />
        <Row icon={Gauge} tint="#38bdf8" label="Environment & sensors" onClick={onOpenEnv} disabled={!activeGrowId} />
        <Row icon={Map} tint="#f59e0b" label="Garden map" onClick={onOpenMap} />
        <Row icon={BarChart2} tint="#a855f7" label="Season analytics" onClick={onOpenStats} />
        <Row icon={Share2} tint="#22c55e" label="Share with a buddy" onClick={() => setShowShare(true)} />
        <Row
          icon={FileText} tint="#94a3b8"
          label={reportBusy ? "Preparing report…" : "Export full report"}
          onClick={openReport} disabled={!activeGrowId || reportBusy} last
        />
      </Group>

      {(notifSupported || isAdmin) && (
        <Group title="App">
          {notifSupported && (
            <Row
              icon={subscribed ? Bell : BellOff}
              tint={subscribed ? "#4ade80" : "#94a3b8"}
              label={notifBusy ? "Working…" : permission === "denied" ? "Notifications blocked" : "Daily reminders"}
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={notifBusy || permission === "denied"}
              last={!isAdmin}
              trailing={
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                  color: subscribed ? "var(--c-accent)" : "var(--c-text-ghost)",
                }}>
                  {subscribed ? "ON" : "OFF"}
                </span>
              }
            />
          )}
          {isAdmin && <Row icon={Users} tint="#f87171" label="Manage members" onClick={onOpenAdmin} last />}
        </Group>
      )}
      {notifError && (
        <div style={{ fontSize: 12, color: "var(--c-danger-soft)", marginTop: 6, paddingLeft: 4 }}>
          {notifError}
        </div>
      )}

      {/* Appearance */}
      <div style={{ marginTop: 20 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase",
          color: "var(--c-text-faint)", margin: "0 4px 7px",
        }}>
          Appearance
        </div>
        <div className="card" style={{ display: "flex", overflow: "hidden", padding: 4, gap: 4 }}>
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                style={{
                  flex: 1, padding: "10px 4px", borderRadius: 12,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  background: active ? "var(--c-accent)" : "transparent",
                  border: "none",
                  color: active ? "var(--c-bg)" : "var(--c-text-dim)",
                  fontSize: 12, fontWeight: 600,
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

      <div style={{ marginTop: 20 }}>
        <PhaseLegend />
        <ThreatsReference />
      </div>

      <AnimatePresence>
        {showShare && <ShareSheet key="share" onClose={() => setShowShare(false)} />}
      </AnimatePresence>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--c-surface-2)" }}>
        <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--c-text-faint)", margin: 0 }}>
          For educational and personal record-keeping only — not medical, legal, or professional cultivation advice. You are responsible for complying with the cannabis laws in your area. Your data is stored privately and never sold; AI features send your grow details to Google&apos;s Gemini API. Contact the admin to delete your account and data.
        </p>
      </div>

      <AuthFooter onBeforeSignOut={onBeforeSignOut} />
    </div>
  );
}
