import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const CACHE_MS = 10 * 60 * 1000; // match worker cache TTL

// Module-level cache so data persists across tab switches.
let _cached = null;
let _fetchedAt = 0;

export function useWeather(enabled) {
  const [data, setData] = useState(_cached);
  const [loading, setLoading] = useState(!_cached && enabled);
  const [error, setError] = useState(null);
  const aborted = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    aborted.current = false;

    if (_cached && Date.now() - _fetchedAt < CACHE_MS) {
      setData(_cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getWeather()
      .then(d => {
        if (aborted.current) return;
        _cached = d;
        _fetchedAt = Date.now();
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
  }, [enabled]);

  return { data, loading, error };
}
