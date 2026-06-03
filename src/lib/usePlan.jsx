import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import { parseConfig } from "./planConfig.js";

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [phaseOverrides, setPhaseOverrides] = useState({});
  const [survey, setSurvey] = useState(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getPlan()
      .then(data => {
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
        setError(null);
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
    <PlanContext.Provider value={{ config, overrides, generatedPlan, phaseOverrides, survey, needsSetup, loading, error, reload }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
