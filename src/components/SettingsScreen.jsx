import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { BarChart2, Camera, ChevronRight, FileText, Monitor, Moon, Pencil, Share2, Sprout, Sun } from "lucide-react";
import ScreenHeader from "./ScreenHeader.jsx";
import ShareSheet from "./ShareSheet.jsx";
import AuthFooter from "./AuthFooter.jsx";
import GrowSwitcher from "./GrowSwitcher.jsx";
import { usePlan } from "../lib/usePlan.jsx";
import { ymd } from "../lib/api.js";
import { currentStageOf, dayOfGrow, stageLabel } from "../lib/stageTimeline.js";
import { partitionPlants } from "./PlantsTab/constants.js";
import { useToast } from "../lib/useToast.jsx";
import { api } from "../lib/api.js";
import { loadWaterUnit } from "../lib/waterUnits.js";
import { loadSaveToRoll, rememberSaveToRoll } from "../lib/savePhoto.js";
import { tapHaptic } from "../lib/haptics.js";

const THEME_OPTIONS = [
  { value: "auto",  label: "Auto",  Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark",  label: "Dark",  Icon: Moon },
];

// The same row, but it flips a setting in place instead of pushing a screen.
function ToggleRow({ icon: Icon, tint, label, detail, on, onToggle, last }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => { tapHaptic(); onToggle(!on); }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        width: "100%", padding: "12px 14px",
        background: "none", border: "none",
        borderBottom: last ? "none" : "1px solid var(--c-border-faint)",
        cursor: "pointer", font: "inherit", textAlign: "left", minHeight: 52,
      }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${tint}1f`, color: tint,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: "var(--c-text)" }}>{label}</span>
        {detail && (
          <span style={{ display: "block", fontSize: 12.5, color: "var(--c-text-faint)", marginTop: 1, lineHeight: 1.45 }}>{detail}</span>
        )}
      </span>
      <span aria-hidden="true" style={{
        flexShrink: 0, width: 44, height: 26, borderRadius: 13, padding: 3,
        background: on ? "var(--c-accent)" : "var(--c-surface-2)",
        transition: "background 0.15s", display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: "50%", background: "var(--c-bg)",
          transition: "transform 0.15s",
        }} />
      </span>
    </button>
  );
}

// iOS-settings-style row: tinted icon square, label, trailing detail + chevron.
function Row({ icon: Icon, tint, label, detail, onClick, disabled, last }) {
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
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: "var(--c-text)" }}>{label}</span>
        {detail && (
          <span style={{ display: "block", fontSize: 12.5, color: "var(--c-text-faint)", marginTop: 1 }}>{detail}</span>
        )}
      </span>
      <ChevronRight size={17} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
    </button>
  );
}

function Group({ title, footer, children }) {
  return (
    <div style={{ marginTop: 22 }}>
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
      {footer && (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--c-text-ghost)", margin: "7px 4px 0" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// Settings. Deliberately short: anything that belongs to ONE space (its name,
// what the space is, starting the dry) lives behind that space's gear in
// Spaces. What is left here is the active grow's outputs and app-wide things.
export default function SettingsScreen({
  today, onOpenStats, onOpenStrains, onOpenGrowSettings, onNewEnvironment, onBeforeSignOut, theme, setTheme,
}) {
  const { grows, activeGrowId } = usePlan();
  const [showShare, setShowShare] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [saveToRoll, setSaveToRoll] = useState(loadSaveToRoll);
  const { addToast } = useToast();

  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;
  const { active: plants } = partitionPlants(activeGrow?.survey);
  const stage = currentStageOf(plants);
  const day = dayOfGrow(activeGrow?.firstDate, ymd(today ?? new Date()));
  const eyebrow = [
    stage ? stageLabel(stage) : null,
    day != null ? `Day ${day}` : null,
  ].filter(Boolean).join(" · ") || null;

  // Downloads the full, print-ready grow report as a self-contained HTML file
  // (it has a built-in "Save as PDF / Print" button). We fetch + save rather
  // than navigating to the URL: this is an installed standalone PWA (scope "/"),
  // so a same-origin window.open is captured by the app window and replaces the
  // running app - which looked like a hard refresh. Requires an active grow.
  async function openReport() {
    if (!activeGrowId || reportBusy) return;
    setReportBusy(true);
    try {
      const html = await api.getGrowReport(activeGrowId, loadWaterUnit());
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
    <div>
      {/* The title is the switcher, so Settings always acts on the space you
          can see, and changing which one is a single tap. */}
      <ScreenHeader
        eyebrow={eyebrow}
        titleSlot={<GrowSwitcher today={today} onNewEnvironment={onNewEnvironment} />}
      />
      <div style={{
        paddingTop: 4,
        paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      }}>

      <Group
        title="This space"
        footer={grows.length > 1 ? "Tap the name above to work on a different space." : null}>
        <Row
          icon={Pencil} tint="#60a5fa"
          label="Name & status"
          detail={activeGrow?.displayName || undefined}
          onClick={() => activeGrowId && onOpenGrowSettings(activeGrowId)}
          disabled={!activeGrowId}
        />
        <Row
          icon={BarChart2} tint="#a855f7"
          label="Analytics"
          detail="Day count, time in each stage, totals"
          onClick={onOpenStats}
          disabled={!activeGrowId}
        />
        <Row
          icon={Share2} tint="#22c55e"
          label="Share with a buddy"
          detail="A read-only link to this grow"
          onClick={() => setShowShare(true)}
        />
        <Row
          icon={FileText} tint="#94a3b8"
          label={reportBusy ? "Preparing report…" : "Export full report"}
          detail="Print-ready HTML of everything recorded"
          onClick={openReport}
          disabled={!activeGrowId || reportBusy}
          last
        />
      </Group>

      {/* Things that belong to you rather than to any one space. */}
      <Group
        title="Yours"
        footer="Every strain you name on a plant, in every space, gathers here by itself.">
        <Row
          icon={Sprout} tint="#4ade80"
          label="Strains"
          detail="Notes, ratings and favourites"
          onClick={onOpenStrains}
        />
        <ToggleRow
          icon={Camera} tint="#fbbf24"
          label="Save shots to Photos"
          detail="A photo taken in the app is not in your camera roll until your phone puts it there, so it offers straight after the shot."
          on={saveToRoll}
          onToggle={(on) => { setSaveToRoll(on); rememberSaveToRoll(on); }}
          last
        />
      </Group>

      {/* Appearance */}
      <div style={{ marginTop: 22 }}>
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
                aria-pressed={active}
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

      <AnimatePresence>
        {showShare && <ShareSheet key="share" onClose={() => setShowShare(false)} />}
      </AnimatePresence>

      <div style={{ marginTop: 26, paddingTop: 16, borderTop: "1px solid var(--c-surface-2)" }}>
        <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--c-text-faint)", margin: 0 }}>
          For educational and personal record-keeping only - not medical, legal, or professional cultivation advice. You are responsible for complying with the cannabis laws in your area. Your data is stored privately and never sold; AI features send your grow details to Google&apos;s Gemini API.
        </p>
      </div>

      <AuthFooter onBeforeSignOut={onBeforeSignOut} />
      </div>
    </div>
  );
}
