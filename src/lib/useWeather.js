import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const CACHE_MS = 10 * 60 * 1000; // match worker cache TTL

// Module-level cache, keyed by grow id, so data persists across tab switches
// without leaking one grow's forecast into another.
const _cache = new Map(); // growId -> { data, fetchedAt }

export function useWeather(enabled, growId = null) {
  const cacheKey = growId ?? "__active__";
  const [data, setData] = useState(() => _cache.get(cacheKey)?.data ?? null);
  const [loading, setLoading] = useState(!_cache.has(cacheKey) && enabled);
  const [error, setError] = useState(null);
  const aborted = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    aborted.current = false;

    const hit = _cache.get(cacheKey);
    if (hit && Date.now() - hit.fetchedAt < CACHE_MS) {
      setData(hit.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getWeather(growId)
      .then(d => {
        if (aborted.current) return;
        _cache.set(cacheKey, { data: d, fetchedAt: Date.now() });
        setData(d);
        setError(null);
      })
      .catch(err => {
        if (aborted.current) return;
        setError(err);
      })
      .finally(() => {
        if (!aborted.current) setLoading(false);
      });

    return () => { aborted.current = true; };
  }, [enabled, growId, cacheKey]);

  return { data, loading, error };
}
