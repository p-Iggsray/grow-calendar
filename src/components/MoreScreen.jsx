import { useState } from "react";
import { Users, Download, Bell, BellOff } from "lucide-react";
import PhaseLegend from "./PhaseLegend.jsx";
import ThreatsReference from "./ThreatsReference.jsx";
import AuthFooter from "./AuthFooter.jsx";
import { LOCATION, STRAIN_1, STRAIN_2 } from "../lib/appConfig.js";
import { api } from "../lib/api.js";
import { useNotifications } from "../lib/useNotifications.js";

export default function MoreScreen({ isAdmin, onOpenAdmin, onBeforeSignOut }) {
  const [exporting, setExporting] = useState(false);
  const { supported: notifSupported, permission, subscribed, busy: notifBusy, error: notifError, subscribe, unsubscribe } = useNotifications();

  async function handleCsvExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await api.downloadGrowLogCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "grow-log.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — no toast in MoreScreen
    } finally {
      setExporting(false);
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
          fontSize: 10, letterSpacing: 4, color: "var(--c-text-ghost)",
          textTransform: "uppercase", marginBottom: 4,
          fontFamily: "'Courier New', monospace",
        }}>
          Grow Log · {LOCATION}
        </div>
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", fontFamily: "'Courier New', monospace" }}>
          1× {STRAIN_1} · 2× {STRAIN_2}
        </div>
      </div>

      <PhaseLegend />
      <ThreatsReference />

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
              color: "#cbe6cb", fontFamily: "'Courier New', monospace",
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
          onClick={handleCsvExport}
          disabled={exporting}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "14px 16px",
            background: "var(--c-surface-1)",
            border: "1px solid var(--c-border)",
            borderRadius: 12, cursor: exporting ? "default" : "pointer",
            color: exporting ? "var(--c-text-ghost)" : "#cbe6cb",
            fontFamily: "'Courier New', monospace",
            fontSize: 13, letterSpacing: 1,
            opacity: exporting ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          <Download size={16} strokeWidth={1.8} />
          {exporting ? "Exporting..." : "Download grow log CSV"}
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
              color: permission === "denied" ? "var(--c-text-faint)" : "#cbe6cb",
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
              fontSize: 10, letterSpacing: 1,
              color: subscribed ? "var(--c-accent)" : "var(--c-text-ghost)",
            }}>
              {subscribed ? "ON" : "OFF"}
            </span>
          </button>
          {permission === "denied" && (
            <div style={{
              fontSize: 10, color: "var(--c-text-faint)", marginTop: 4, paddingLeft: 4,
              fontFamily: "'Courier New', monospace",
            }}>
              Notifications are blocked — allow them in your browser settings
            </div>
          )}
          {notifError && (
            <div style={{
              fontSize: 10, color: "#fca5a5", marginTop: 4, paddingLeft: 4,
              fontFamily: "'Courier New', monospace",
            }}>
              {notifError}
            </div>
          )}
        </div>
      )}

      <AuthFooter onBeforeSignOut={onBeforeSignOut} />
    </div>
  );
}
