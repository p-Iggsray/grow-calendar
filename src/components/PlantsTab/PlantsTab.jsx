import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToday } from "../../lib/dates.js";
import { getPhase, PHASES } from "../../lib/growData.js";
import { api } from "../../lib/api.js";
import { MONO, partitionPlants } from "./constants.js";
import PlantCard from "./PlantCard.jsx";
import PlantDetail from "./PlantDetail.jsx";
import AddPlantSheet from "./AddPlantSheet.jsx";
import ConfirmModal from "../ConfirmModal.jsx";

const FULL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtHarvest(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function EmptyMsg({ text }) {
  return <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "40px 16px", textAlign: "center" }}>{text}</div>;
}

export default function PlantsTab() {
  const { activeGrowId, survey, config, needsSetup, reload } = usePlan();
  const today = useToday();
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [summary, setSummary] = useState({});

  const loadSummary = useCallback(() => {
    if (!activeGrowId) { setSummary({}); return; }
    api.getPlantLogSummary(activeGrowId)
      .then((d) => setSummary(d.summary ?? {}))
      .catch(() => setSummary({}));
  }, [activeGrowId]);

  useEffect(() => { loadSummary(); }, [loadSummary, survey]);

  if (needsSetup) return <EmptyMsg text="Finish setting up this grow first." />;

  const { active, archived } = partitionPlants(survey);
  const currentPhaseLabel = config ? (PHASES[getPhase(today, config)]?.label ?? null) : null;
  const harvestLabel = fmtHarvest(config?.hazeHarvest) || fmtHarvest(config?.gdpHarvest) || null;
  const selectedPlant = [...active, ...archived].find((p) => p.id === selectedId) || null;

  async function handleAdd(fields) {
    setSaving(true);
    try { await api.addPlant(activeGrowId, fields); setAdding(false); reload(); }
    finally { setSaving(false); }
  }
  async function handleArchive(plant) {
    const next = plant.status === "growing" ? "harvested" : "growing";
    await api.patchPlant(activeGrowId, plant.id, { status: next });
    reload();
  }
  async function handleDelete(plant) {
    await api.deletePlant(activeGrowId, plant.id);
    setConfirmDelete(null);
    setSelectedId(null);
    reload();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 16px 14px", paddingTop: "calc(18px + env(safe-area-inset-top, 0px))" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>Plants</div>
        <button type="button" className="touch-target" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", borderRadius: 20, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, cursor: "pointer" }}>
          <Plus size={14} /> Add plant
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
        {active.length === 0 && <EmptyMsg text="No plants yet. Add your first one." />}
        {active.map((p) => (
          <PlantCard key={p.id} plant={p} currentPhaseLabel={currentPhaseLabel} metrics={summary[p.id]} onOpen={() => setSelectedId(p.id)} />
        ))}

        {archived.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setShowArchived((s) => !s)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer", padding: "6px 0" }}>
              {showArchived ? "▾" : "▸"} Archived ({archived.length})
            </button>
            {showArchived && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8, opacity: 0.7 }}>
                {archived.map((p) => (
                  <PlantCard key={p.id} plant={p} currentPhaseLabel={null} metrics={summary[p.id]} onOpen={() => setSelectedId(p.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {adding && (
          <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => !saving && setAdding(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--c-panel-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 16 }}>Add a plant</div>
              <AddPlantSheet onSave={handleAdd} onCancel={() => setAdding(false)} saving={saving} />
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlant && (
          <PlantDetail
            key={selectedPlant.id}
            growId={activeGrowId}
            plant={selectedPlant}
            currentPhaseLabel={selectedPlant.status === "growing" ? currentPhaseLabel : null}
            harvestLabel={selectedPlant.status === "growing" ? harvestLabel : null}
            onClose={() => setSelectedId(null)}
            onArchive={handleArchive}
            onDelete={(p) => setConfirmDelete(p)}
            onLogChange={loadSummary}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!confirmDelete}
        tone="destructive"
        title="Delete plant?"
        message={confirmDelete ? `This permanently deletes "${confirmDelete.name || "this plant"}" and its entire log.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
