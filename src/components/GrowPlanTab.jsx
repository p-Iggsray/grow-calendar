import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import GrowTabStrip from "./GrowTabStrip.jsx";
import PlanScreen from "./PlanScreen.jsx";

const MONO = "'Courier New', monospace";

export default function GrowPlanTab({
  grows,
  activeGrowId,
  generatedPlan,
  phaseOverrides,
  survey,
  onReload,
  onNewGrow,
}) {
  const [selectedId, setSelectedId] = useState(activeGrowId);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Keep selection valid when grows list or activeGrowId changes.
  useEffect(() => {
    if (!grows.find(g => g.id === selectedId)) {
      setSelectedId(activeGrowId);
    }
  }, [grows, activeGrowId, selectedId]);

  // Fetch full data when viewing a non-active grow.
  useEffect(() => {
    if (!selectedId || selectedId === activeGrowId) {
      setViewData(null);
      return;
    }
    let cancelled = false;
    setViewLoading(true);
    api.getGrow(selectedId)
      .then(data => {
        if (!cancelled) {
          setViewData(data);
          setViewLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setViewLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId, activeGrowId]);

  async function handleNewGrow() {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await api.createGrow({ displayName: "New Grow" });
      onNewGrow(id);
    } catch {
      // silently ignore; user can retry
    } finally {
      setCreating(false);
    }
  }

  const isActive = selectedId === activeGrowId;
  const resolvedPlan      = isActive ? generatedPlan  : (viewData?.generatedPlan  ?? null);
  const resolvedOverrides = isActive ? phaseOverrides : (viewData?.phaseOverrides ?? {});
  const resolvedSurvey    = isActive ? survey         : (viewData?.survey         ?? null);

  return (
    <div>
      <GrowTabStrip
        grows={grows}
        selectedId={selectedId}
        activeGrowId={activeGrowId}
        onSelect={(id) => { setSelectedId(id); setViewData(null); }}
        onNewGrow={handleNewGrow}
        creating={creating}
      />

      {viewLoading ? (
        <div style={{
          padding: 24,
          fontFamily: MONO,
          color: "var(--c-text-ghost)",
          letterSpacing: 4,
          fontSize: 11,
        }}>
          LOADING…
        </div>
      ) : (
        <PlanScreen
          growId={selectedId}
          generatedPlan={resolvedPlan}
          phaseOverrides={resolvedOverrides}
          survey={resolvedSurvey}
          onReload={() => {
            if (isActive) {
              onReload();
            } else {
              // Re-fetch the viewed grow's data.
              setViewLoading(true);
              api.getGrow(selectedId)
                .then(data => { setViewData(data); setViewLoading(false); })
                .catch(() => setViewLoading(false));
            }
          }}
        />
      )}
    </div>
  );
}
