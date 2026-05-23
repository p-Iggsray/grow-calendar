import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

export function useCheckoffs(date, enabled) {
  const [checked, setChecked] = useState([]);
  const [loading, setLoading] = useState(false);
  const dateKey = date ? ymd(date) : null;
  const requestId = useRef(0);

  const fetchNow = useCallback(async () => {
    if (!dateKey || !enabled) {
      setChecked([]);
      return;
    }
    const myId = ++requestId.current;
    setLoading(true);
    try {
      const data = await api.getCheckoffs(dateKey);
      if (myId === requestId.current) setChecked(data.checked || []);
    } catch {
      // swallow; user retries by reselecting
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [dateKey, enabled]);

  useEffect(() => { fetchNow(); }, [fetchNow]);

  useEffect(() => {
    function onFocus() { fetchNow(); }
    function onVisible() { if (!document.hidden) fetchNow(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNow]);

  const toggle = useCallback(async (idx) => {
    if (!dateKey || !enabled) return;
    let next;
    setChecked(prev => {
      next = prev.includes(idx)
        ? prev.filter(n => n !== idx)
        : [...prev, idx].sort((a, b) => a - b);
      return next;
    });
    try {
      await api.putCheckoffs(dateKey, next);
    } catch {
      fetchNow();
    }
  }, [dateKey, enabled, fetchNow]);

  return { checked, loading, toggle };
}
