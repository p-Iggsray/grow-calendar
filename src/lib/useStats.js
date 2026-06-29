import { useState, useEffect } from "react";
import { api } from "./api.js";

export function useStats(enabled = true, growId = null) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    api.getStats(growId)
      .then(data => { if (!cancelled) { setStats(data); setLoading(false); } })
      .catch(err  => { if (!cancelled) { setError(err);  setLoading(false); } });
    return () => { cancelled = true; };
  }, [enabled, growId]);

  return { stats, loading, error };
}
