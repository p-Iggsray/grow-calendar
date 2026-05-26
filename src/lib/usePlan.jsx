import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api.js";
import { parseConfig } from "./planConfig.js";

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getPlan()
      .then(data => {
        if (cancelled) return;
        setConfig(parseConfig(data.config));
        setOverrides(data.overrides || {});
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <PlanContext.Provider value={{ config, overrides, loading, error }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
