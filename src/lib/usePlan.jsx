import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

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
          setLoading(false);
          return;
        }

        // Resolve which grow to show. PREFER a space that actually finished
        // setup (it has a survey) so a half-finished or abandoned one can never
        // route the app into an inescapable setup wizard on load or after a
        // reset. Only fall into first-time setup when NO space is set up yet,
        // and then resume the existing unfinished one rather than leaving the
        // choice ambiguous.
        //
        // An archived space is put away, so it never becomes the one the
        // calendar follows - not on load, and not because it was the last one
        // stored. It is still in `grows`, because the environments list is
        // where you go to bring it back.
        const stored = getStoredGrowId();
        const live = growsList.filter(g => !g.archivedAt);
        const pool = live.length ? live : growsList;
        const ready = pool.filter(g => g.survey);

        let targetId;
        if (ready.length > 0) {
          const pick = ready.find(g => g.id === stored)
            || ready.find(g => g.status === "active")
            || ready[0];
          targetId = pick.id;
        } else {
          const pick = pool.find(g => g.id === stored) || pool[0];
          targetId = pick.id;
        }

        if (targetId !== stored) storeGrowId(targetId);
        setActiveGrowIdRaw(targetId);

        const data = await api.getGrow(targetId);
        if (cancelled) return;

        setNeedsSetup(Boolean(data.needsSetup));
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

  // Everything outside the environments list works on the spaces still in use.
  // The list itself wants both, so `grows` stays whole.
  const liveGrows = grows.filter(g => !g.archivedAt);
  const archivedGrows = grows.filter(g => g.archivedAt);

  return (
    <PlanContext.Provider value={{
      grows,
      liveGrows,
      archivedGrows,
      activeGrowId,
      setActiveGrowId,
      survey, lifecycle,
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
