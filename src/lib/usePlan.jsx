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
  const [eventRules, setEventRules] = useState([]);
  const [survey, setSurvey] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
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

        // Resolve which grow to show. PREFER a grow that's actually been set up
        // (has config) so a half-finished/abandoned grow - which has no config - // can never route the app into an inescapable setup wizard on load or
        // after a reset. Only fall into first-time setup when NO grow is
        // configured yet, and then resume an existing unconfigured grow rather
        // than leaving the choice ambiguous.
        const stored = getStoredGrowId();
        const configured = growsList.filter(g => g.config);

        let targetId;
        if (configured.length > 0) {
          const pick = configured.find(g => g.id === stored)
            || configured.find(g => g.status === "active")
            || configured[0];
          targetId = pick.id;
        } else {
          const pick = growsList.find(g => g.id === stored) || growsList[0];
          targetId = pick.id;
        }

        if (targetId !== stored) storeGrowId(targetId);
        setActiveGrowIdRaw(targetId);

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
        setEventRules(data.eventRules || []);
        setSurvey(data.survey || null);
        setLifecycle(data.lifecycle || null);
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
      config, overrides, generatedPlan, phaseOverrides, eventRules, survey, lifecycle,
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
