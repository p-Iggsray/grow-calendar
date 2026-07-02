import { useEffect, useState } from "react";
import { api } from "./api.js";

// One day's imported environment rollup (from the controller CSV import) for a
// grow: { samples, temp:{avg,min,max}, humidity:{...}, vpd:{...} } or null when
// nothing was imported for that date. The whole summary is cached per grow so
// flipping through days doesn't refetch.
const CACHE_MS = 3 * 60 * 1000;
const _cache = new Map(); // growId -> { days: Map<date, rollup>, fetchedAt }

export function useEnvDay(growId, dateKey, enabled) {
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !growId || !dateKey) { setDay(null); return; }
    let alive = true;

    const hit = _cache.get(growId);
    if (hit && Date.now() - hit.fetchedAt < CACHE_MS) {
      setDay(hit.days.get(dateKey) ?? null);
      return;
    }

    setLoading(true);
    api.getEnvSummary(growId)
      .then(summary => {
        if (!alive) return;
        const days = new Map((summary?.days ?? []).map(d => [d.date, d]));
        _cache.set(growId, { days, fetchedAt: Date.now() });
        setDay(days.get(dateKey) ?? null);
      })
      .catch(() => { if (alive) setDay(null); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [growId, dateKey, enabled]);

  return { day, loading };
}
