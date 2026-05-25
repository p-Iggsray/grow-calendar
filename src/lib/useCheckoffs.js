import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";
import { useToast } from "./useToast.jsx";

export function useCheckoffs(date, enabled) {
  const [checked, setChecked] = useState([]);
  const [loading, setLoading] = useState(false);
  const dateKey = date ? ymd(date) : null;
  const requestId = useRef(0);
  const { addToast } = useToast();

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
      if (myId === requestId.current) addToast("Couldn't load tasks — check your connection");
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [dateKey, enabled, addToast]);

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
      addToast("Couldn't save — your change was reversed");
      fetchNow();
    }
  }, [dateKey, enabled, fetchNow]);

  return { checked, loading, toggle };
}
