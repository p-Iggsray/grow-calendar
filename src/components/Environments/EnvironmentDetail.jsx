import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, SlidersHorizontal, CalendarCheck, Trash2, Sun, Ruler, Droplets, Sprout, Wind } from "lucide-react";
import { api } from "../../lib/api.js";
import { parseConfig } from "../../lib/planConfig.js";
import { tapHaptic } from "../../lib/haptics.js";
import { getLifecyclePhase } from "../../lib/lifecycle.js";
import { MONO, partitionPlants } from "../PlantsTab/constants.js";
import PlantCard from "../PlantsTab/PlantCard.jsx";
import PlantDetail from "../PlantsTab/PlantDetail.jsx";
import AddPlantSheet from "../PlantsTab/AddPlantSheet.jsx";
import EnvConditions from "../Environment/EnvConditions.jsx";
import EnvSetupForm from "./EnvSetupForm.jsx";
import ConfirmModal from "../ConfirmModal.jsx";
import ScreenHeader from "../ScreenHeader.jsx";
import Portal from "../Portal.jsx";
import HeaderMenu from "../HeaderMenu.jsx";
import { ymd as lifecycleYmd, useLifecycleSave } from "../Lifecycle/shared.jsx";

const FULL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtHarvest(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export const ENV_KIND_LABEL = { indoor: "Indoor", outdoor: "Outdoor", greenhouse: "Greenhouse" };
const MEDIUM_LABEL = { soil: "Soil", coco: "Coco", hydro: "Hydro", other: "Other medium" };
const CONTAINER_LABEL = { fabric: "Fabric pots", plastic: "Plastic pots", ground: "In-ground", other: "Other containers" };
const WATERING_LABEL = { hand: "Hand watered", drip: "Drip / automated" };

// One-line summary chips describing the space.
export function envSetupChips(survey) {
  if (!survey) return [];
  const light = [survey.lightSchedule, survey.lightType, survey.lightWatts ? `${survey.lightWatts}W` : null]
    .filter(Boolean).join(" · ");
  return [
    survey.envSize ? { icon: Ruler, text: survey.envSize } : null,
    survey.envCapacity ? { icon: Sprout, text: `${survey.envCapacity} plant${survey.envCapacity === 1 ? "" : "s"}` } : null,
    light ? { icon: Sun, text: light } : null,
    survey.medium ? {
      icon: Droplets,
      text: [
        MEDIUM_LABEL[survey.medium] ?? survey.medium,
        survey.containerType === "ground"
          ? CONTAINER_LABEL.ground
          : survey.containerGallons ? `${survey.containerGallons} gal` : null,
        WATERING_LABEL[survey.wateringMethod] ?? null,
      ].filter(Boolean).join(" · "),
    } : null,
  ].filter(Boolean);
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 24 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
        {children}
      </span>
      {action}
    </div>
  );
}

function pillBtn(color = "var(--c-text-dim)", bg = "var(--c-surface-1)", border = "var(--c-border)") {
  return {
    display: "flex", alignItems: "center", gap: 5,
    background: bg, border: `1px solid ${border}`, borderRadius: 18,
    padding: "7px 13px", color, fontFamily: MONO, fontSize: 11, cursor: "pointer",
  };
}

// Everything about ONE grow environment: what the space is, the plants living
// in it, and its measured conditions. This is where a grower works day to day
// outside the calendar.
export default function EnvironmentDetail({
  grow, isActive, today, onClose, onActivate, onOpenSettings, onDelete, onChanged, onOpenJournalDay,
}) {
  const growId = grow.id;
  const survey = grow.survey ?? null;
  const config = grow.config ? parseConfig(grow.config) : null;

  const [editingSetup, setEditingSetup] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingPlant, setSavingPlant] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDeletePlant, setConfirmDeletePlant] = useState(null);
  const [confirmDrying, setConfirmDrying] = useState(false);
  const [summary, setSummary] = useState({});
  // Drying can only be started on the environment the calendar is following,
  // which is the one the lifecycle hook writes to.
  const { save: saveLifecycle, busy: dryingBusy } = useLifecycleSave();
  const growing = getLifecyclePhase(grow.lifecycle) === "growing";

  const loadSummary = useCallback(() => {
    if (!growId) { setSummary({}); return; }
    api.getPlantLogSummary(growId)
      .then((d) => setSummary(d.summary ?? {}))
      .catch(() => setSummary({}));
  }, [growId]);
  useEffect(() => { loadSummary(); }, [loadSummary, grow.survey]);

  const { active, archived } = partitionPlants(survey);
  const chips = envSetupChips(survey);
  const kindLabel = ENV_KIND_LABEL[survey?.environment] ?? "Space";
  const harvestLabel = fmtHarvest(config?.hazeHarvest) || fmtHarvest(config?.gdpHarvest) || null;
  const selectedPlant = [...active, ...archived].find((p) => p.id === selectedId) || null;

  async function handleSaveSetup(fields) {
    setSavingSetup(true);
    try {
      await api.saveEnvironmentSetup(growId, fields);
      setEditingSetup(false);
      await onChanged?.();
    } finally { setSavingSetup(false); }
  }
  async function handleAddPlant(fields) {
    setSavingPlant(true);
    try { await api.addPlant(growId, fields); setAdding(false); await onChanged?.(); }
    finally { setSavingPlant(false); }
  }
  async function handleArchivePlant(plant) {
    const next = plant.status === "growing" ? "harvested" : "growing";
    await api.patchPlant(growId, plant.id, { status: next });
    await onChanged?.();
  }
  async function handleDeletePlant(plant) {
    await api.deletePlant(growId, plant.id);
    setConfirmDeletePlant(null);
    setSelectedId(null);
    await onChanged?.();
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 260, restDelta: 0.5 }}
      style={{ position: "fixed", inset: 0, zIndex: 38, background: "var(--c-bg)", overflowY: "auto", paddingBottom: 90 }}
    >
      {/* Every screen wears the same top strip: back on the left, this
          screen's own settings behind the gear on the right. */}
      <ScreenHeader
        eyebrow={kindLabel}
        title={grow.displayName || "Unnamed environment"}
        onBack={onClose}
        backLabel="Back to environments"
        right={(
          <HeaderMenu
            title="Environment settings"
            items={[
              { icon: Pencil, label: "Edit the space", detail: "Size, lighting, medium, watering", onClick: () => setEditingSetup(true) },
              { icon: SlidersHorizontal, label: "Name & season dates", onClick: () => onOpenSettings(growId) },
              isActive && growing && {
                icon: Wind, label: "Start drying early",
                detail: "Ends the calendar and opens the dry tracker",
                onClick: () => setConfirmDrying(true), disabled: dryingBusy,
              },
              { icon: Trash2, label: "Delete environment", tone: "destructive", onClick: () => onDelete(grow) },
            ]}
          />
        )}
      />

      <div style={{ padding: 16, maxWidth: 620, margin: "0 auto" }}>
        {(survey?.location || harvestLabel) && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-muted)" }}>
            {[survey?.location, harvestLabel ? `harvest ${harvestLabel}` : null].filter(Boolean).join(" · ")}
          </div>
        )}

        {/* Calendar activation */}
        {isActive ? (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
            padding: "7px 12px", borderRadius: 16,
            background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.35)",
            fontFamily: MONO, fontSize: 11, color: "var(--c-accent)", letterSpacing: 0.5,
          }}>
            <CalendarCheck size={13} strokeWidth={2} />
            Showing on the calendar
          </div>
        ) : grow.config ? (
          <button
            type="button"
            className="touch-target"
            onClick={() => { tapHaptic(); onActivate(growId); }}
            style={{ ...pillBtn("var(--c-accent)", "rgba(74,222,128,0.1)", "rgba(74,222,128,0.35)"), marginTop: 12, fontSize: 12, padding: "9px 15px" }}>
            <CalendarCheck size={14} strokeWidth={2} />
            Show this environment on the calendar
          </button>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-warn)", marginTop: 12 }}>
            Setup is not finished, so this space has no calendar yet.
          </div>
        )}

        {/* The space itself - editing lives behind the header gear. */}
        <SectionTitle>The space</SectionTitle>

        {editingSetup ? (
          <div className="card" style={{ padding: 14 }}>
            <EnvSetupForm survey={survey} onSave={handleSaveSetup} onCancel={() => setEditingSetup(false)} saving={savingSetup} />
          </div>
        ) : chips.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {chips.map(({ icon: Icon, text }, i) => (
              <div key={i} className="card" style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={14} strokeWidth={1.9} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: "var(--c-text-dim)" }}>{text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)" }}>
            Nothing recorded about this space yet. Use the gear above to describe it.
          </div>
        )}

        {/* Plants living here */}
        <SectionTitle
          action={(
            <button type="button" onClick={() => setAdding(true)} style={pillBtn("var(--c-accent)", "rgba(74,222,128,0.1)", "rgba(74,222,128,0.3)")}>
              <Plus size={13} /> Add plant
            </button>
          )}>
          Plants{active.length > 0 ? ` (${active.length})` : ""}
        </SectionTitle>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {active.length === 0 && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)" }}>
              No plants in this space yet.
            </div>
          )}
          {active.map((p) => (
            <PlantCard key={p.id} plant={p} metrics={summary[p.id]} today={today} config={config} onOpen={() => setSelectedId(p.id)} />
          ))}

          {archived.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowArchived((s) => !s)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer", padding: "6px 0" }}>
                {showArchived ? "▾" : "▸"} Archived ({archived.length})
              </button>
              {showArchived && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8, opacity: 0.7 }}>
                  {archived.map((p) => (
                    <PlantCard key={p.id} plant={p} metrics={summary[p.id]} today={today} config={config} onOpen={() => setSelectedId(p.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Measured conditions */}
        <SectionTitle>Conditions</SectionTitle>
        <EnvConditions growId={growId} indoorish={survey?.environment !== "outdoor"} />

      </div>

      {/* Add-plant sheet */}
      <AnimatePresence>
        {adding && (
          <Portal>
          <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => !savingPlant && setAdding(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--c-panel-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))", maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 16 }}>
                Add a plant to {grow.displayName || "this space"}
              </div>
              <AddPlantSheet onSave={handleAddPlant} onCancel={() => setAdding(false)} saving={savingPlant} />
            </div>
          </div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Plant detail */}
      <AnimatePresence>
        {selectedPlant && (
          <PlantDetail
            key={selectedPlant.id}
            growId={growId}
            plant={selectedPlant}
            harvestLabel={selectedPlant.status === "growing" ? harvestLabel : null}
            today={today}
            config={config}
            onOpenJournalDay={onOpenJournalDay}
            onClose={() => setSelectedId(null)}
            onArchive={handleArchivePlant}
            onDelete={(p) => setConfirmDeletePlant(p)}
            onLogChange={loadSummary}
            onChanged={onChanged}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={confirmDrying}
        title="Start drying?"
        message="This hides the calendar and opens the drying tracker, starting the dry-day counter today. You can keep logging in Spaces and chatting with MJ."
        confirmLabel="Start drying"
        cancelLabel="Not yet"
        onConfirm={() => { setConfirmDrying(false); saveLifecycle({ phase: "drying", dryStartedAt: lifecycleYmd(today) }); }}
        onCancel={() => setConfirmDrying(false)}
      />

      <ConfirmModal
        open={!!confirmDeletePlant}
        tone="destructive"
        title="Delete plant?"
        message={confirmDeletePlant ? `This permanently deletes "${confirmDeletePlant.name || "this plant"}" and its entire log.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDeletePlant && handleDeletePlant(confirmDeletePlant)}
        onCancel={() => setConfirmDeletePlant(null)}
      />
    </motion.div>
  );
}
