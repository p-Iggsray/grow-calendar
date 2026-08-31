import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Thermometer, Droplets, Gauge, CalendarCheck, Home, Trees, Warehouse } from "lucide-react";
import { api } from "../../lib/api.js";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToday } from "../../lib/dates.js";
import { currentStageOf, stageLabel } from "../../lib/stageTimeline.js";
import { tapHaptic } from "../../lib/haptics.js";
import { MONO, partitionPlants } from "../PlantsTab/constants.js";
import EnvironmentDetail, { ENV_KIND_LABEL } from "./EnvironmentDetail.jsx";
import DeleteGrowConfirm from "../DeleteGrowConfirm.jsx";
import ConfirmModal from "../ConfirmModal.jsx";
import ScreenHeader from "../ScreenHeader.jsx";

const KIND_ICON = { indoor: Home, outdoor: Trees, greenhouse: Warehouse };

const STATUS_STYLE = {
  harvested: { label: "HARVESTED", color: "var(--c-warn)", bg: "rgba(251,191,36,0.10)" },
  abandoned: { label: "ARCHIVED", color: "var(--c-text-ghost)", bg: "rgba(255,255,255,0.04)" },
};

function Reading({ icon: Icon, color, value, unit }) {
  if (value == null) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon size={12} strokeWidth={2} style={{ color }} />
      <span style={{ fontFamily: "var(--font-num)", fontSize: 12, color: "var(--c-text-dim)" }}>
        {value}{unit}
      </span>
    </span>
  );
}

function EnvironmentCard({ grow, isActive, conditions, onOpen }) {
  const survey = grow.survey ?? null;
  const KindIcon = KIND_ICON[survey?.environment] ?? Home;
  const kind = ENV_KIND_LABEL[survey?.environment] ?? "Space";
  const { active: plants } = partitionPlants(survey);
  // The space's stage is simply the furthest its plants have reached; there
  // are no predicted dates to read it off any more.
  const stage = currentStageOf(plants);
  const status = !survey
    ? { label: "IN SETUP", color: "var(--c-warn)", bg: "rgba(251,191,36,0.10)" }
    : STATUS_STYLE[grow.status] ?? null;

  const line2 = [
    kind,
    survey?.envSize || null,
    survey?.lightSchedule || null,
  ].filter(Boolean).join(" · ");

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={() => { tapHaptic(); onOpen(grow.id); }}
      className="card"
      style={{
        display: "block", width: "100%", textAlign: "left", padding: 16, cursor: "pointer",
        border: isActive ? "1.5px solid rgba(74,222,128,0.4)" : undefined,
        background: isActive ? "rgba(74,222,128,0.06)" : undefined,
        opacity: grow.status === "abandoned" ? 0.7 : 1,
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <KindIcon size={17} strokeWidth={1.9} style={{ color: "var(--c-text-muted)", flexShrink: 0 }} />
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--c-text)", letterSpacing: -0.3, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {grow.displayName || "Unnamed environment"}
          </span>
        </div>
        {status && (
          <span style={{ padding: "4px 9px", borderRadius: 6, flexShrink: 0, background: status.bg, color: status.color, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2 }}>
            {status.label}
          </span>
        )}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-muted)", marginTop: 7, letterSpacing: 0.2 }}>
        {line2}
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5 }}>
        {plants.length} plant{plants.length === 1 ? "" : "s"}
        {stage ? ` · ${stageLabel(stage)}` : ""}
      </div>

      {conditions?.samples > 0 && (
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <Reading icon={Thermometer} color="#f97316" value={conditions.temp?.avg} unit="°F" />
          <Reading icon={Droplets} color="#38bdf8" value={conditions.humidity?.avg} unit="%" />
          <Reading icon={Gauge} color="#a855f7" value={conditions.vpd?.avg} unit=" kPa" />
        </div>
      )}

      {isActive && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 10, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.2, color: "var(--c-accent)", textTransform: "uppercase" }}>
          <CalendarCheck size={12} strokeWidth={2} />
          On the calendar
        </div>
      )}
    </motion.button>
  );
}

// The Environments tab: every grow space you keep, each with its own plants,
// conditions, and calendar. Replaces the old Plants and Plan tabs.
export default function EnvironmentsTab({ openPlantId, onOpenPlantConsumed, onOpenJournalDay, onNewEnvironment, onOpenSettings }) {
  const { grows, activeGrowId, setActiveGrowId, reload } = usePlan();
  const today = useToday();
  const [openId, setOpenId] = useState(null);
  const [conditions, setConditions] = useState({});
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [resumeGrow, setResumeGrow] = useState(null);

  // Live conditions for every space, so the list reads like a dashboard.
  useEffect(() => {
    let cancelled = false;
    Promise.all((grows ?? []).map((g) =>
      api.getEnvSummary(g.id).then((d) => [g.id, d?.overall ?? null]).catch(() => [g.id, null]),
    )).then((pairs) => {
      if (!cancelled) setConditions(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, [grows]);

  // Cross-tab handoff: the journal (or MJ) asked us to open a specific plant.
  // It always belongs to the active environment.
  useEffect(() => {
    if (!openPlantId) return;
    setOpenId(activeGrowId);
    onOpenPlantConsumed?.();
  }, [openPlantId, activeGrowId, onOpenPlantConsumed]);

  const openGrow = grows.find((g) => g.id === openId) || null;

  async function handleNew() {
    if (creating) return;
    // Resume an unfinished space instead of stacking another empty one.
    const unfinished = grows.find((g) => !g.survey);
    if (unfinished) { onNewEnvironment(unfinished.id); return; }
    setCreating(true);
    try {
      const { id } = await api.createGrow({ displayName: "New Environment" });
      onNewEnvironment(id);
    } catch { /* user can retry */ }
    finally { setCreating(false); }
  }

  function handleOpen(id) {
    const grow = grows.find((g) => g.id === id);
    // A space that never finished setup has no calendar to show - offer to
    // finish it rather than opening a hollow page.
    if (grow && !grow.survey) { setResumeGrow(grow); return; }
    setOpenId(id);
  }

  return (
    <div>
      <ScreenHeader
        title="Environments"
        right={(
          <button
            type="button"
            className="touch-target"
            onClick={handleNew}
            disabled={creating}
            style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              padding: "9px 15px", borderRadius: 20,
              background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
              color: creating ? "var(--c-text-ghost)" : "var(--c-accent)",
              fontFamily: MONO, fontSize: 11.5, letterSpacing: 0.3, fontWeight: 600,
              cursor: creating ? "default" : "pointer", opacity: creating ? 0.6 : 1,
            }}>
            <Plus size={14} /> {creating ? "…" : "New space"}
          </button>
        )}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px 0" }}>
        {grows.length === 0 && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "40px 16px", textAlign: "center" }}>
            No environments yet. Create your first grow space.
          </div>
        )}
        {grows.map((g) => (
          <EnvironmentCard
            key={g.id}
            grow={g}
            isActive={g.id === activeGrowId}
            conditions={conditions[g.id]}
            onOpen={handleOpen}
          />
        ))}
      </div>

      <AnimatePresence>
        {openGrow && (
          <EnvironmentDetail
            key={openGrow.id}
            grow={openGrow}
            isActive={openGrow.id === activeGrowId}
            today={today}
            onClose={() => setOpenId(null)}
            onActivate={(id) => { setActiveGrowId(id); }}
            onOpenSettings={onOpenSettings}
            onDelete={(g) => setDeleting(g)}
            onChanged={reload}
            onOpenJournalDay={onOpenJournalDay}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={Boolean(resumeGrow)}
        title="Finish setting up this space?"
        message={`"${resumeGrow?.displayName || "This environment"}" isn't finished setting up yet, so it has no calendar. Your answers so far are saved - want to pick up where you left off?`}
        confirmLabel="Finish setup"
        cancelLabel="Not now"
        onConfirm={() => { const id = resumeGrow.id; setResumeGrow(null); onNewEnvironment(id); }}
        onCancel={() => setResumeGrow(null)}
      />

      {deleting && (
        <DeleteGrowConfirm
          growId={deleting.id}
          growName={deleting.displayName}
          onClose={() => setDeleting(null)}
          onDeleted={async () => { setDeleting(null); setOpenId(null); await reload(); }}
        />
      )}
    </div>
  );
}
