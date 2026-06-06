import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import { parseConfig } from "./planConfig.js";

const PlanContext = createContext(null);

function getStoredGrowId() {
  try { return localStorage.getItem("activeGrowId") || null; } catch { return null; }
}

function storeGrowId(id) {
  try {
    if (id) localStorage.setItem("activeGrowId", id);
    else localStorage.removeItem("activeGrowId");
  } catch { /* storage unavailable */ }
}

export function PlanProvider({ children }) {
  const [grows, setGrows] = useState([]);
  const [activeGrowId, setActiveGrowIdRaw] = useState(getStoredGrowId);

  const [config, setConfig] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [phaseOverrides, setPhaseOverrides] = useState({});
  const [survey, setSurvey] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchKey, setFetchKey] = useState(0);

  const setActiveGrowId = useCallback((id) => {
    storeGrowId(id);
    setActiveGrowIdRaw(id);
    setFetchKey(k => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.listGrows()
      .then(async (growsList) => {
        if (cancelled) return;
        setGrows(growsList);

        if (growsList.length === 0) {
          setNeedsSetup(true);
          setConfig(null);
          setLoading(false);
          return;
        }

        // Resolve which grow is active.
        const stored = getStoredGrowId();
        const validStored = stored && growsList.find(g => g.id === stored);
        let targetId = validStored ? stored : null;
        if (!targetId) {
          const first = growsList.find(g => g.status === "active") || growsList[0];
          targetId = first?.id || null;
          storeGrowId(targetId);
          setActiveGrowIdRaw(targetId);
        }

        if (!targetId) {
          setNeedsSetup(true);
          setConfig(null);
          setLoading(false);
          return;
        }

        const data = await api.getGrow(targetId);
        if (cancelled) return;

        if (data.needsSetup) {
          setNeedsSetup(true);
          setConfig(null);
        } else {
          setNeedsSetup(false);
          setConfig(parseConfig(data.config));
        }
        setOverrides(data.overrides || {});
        setGeneratedPlan(data.generatedPlan || null);
        setPhaseOverrides(data.phaseOverrides || {});
        setSurvey(data.survey || null);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [fetchKey]);

  const reload = useCallback(() => setFetchKey(k => k + 1), []);

  return (
    <PlanContext.Provider value={{
      grows,
      activeGrowId,
      setActiveGrowId,
      config, overrides, generatedPlan, phaseOverrides, survey,
      needsSetup, loading, error, reload,
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
