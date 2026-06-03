import { useState } from "react";
import { Users, Download } from "lucide-react";
import PhaseLegend from "./PhaseLegend.jsx";
import ThreatsReference from "./ThreatsReference.jsx";
import AuthFooter from "./AuthFooter.jsx";
import { LOCATION, STRAIN_1, STRAIN_2 } from "../lib/appConfig.js";
import { api } from "../lib/api.js";

export default function MoreScreen({ isAdmin, onOpenAdmin, onBeforeSignOut }) {
  const [exporting, setExporting] = useState(false);

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
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          fontSize: 10, letterSpacing: 4, color: "#3a5a3a",
          textTransform: "uppercase", marginBottom: 4,
          fontFamily: "'Courier New', monospace",
        }}>
          Grow Log · {LOCATION}
        </div>
        <div style={{ fontSize: 11, color: "#5a8a5a", fontFamily: "'Courier New', monospace" }}>
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
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
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, cursor: exporting ? "default" : "pointer",
            color: exporting ? "#3a5a3a" : "#cbe6cb",
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

      <AuthFooter onBeforeSignOut={onBeforeSignOut} />
    </div>
  );
}
