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
      if (myId === requestId.current) addToast("Couldn't load tasks. Check your connection");
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [dateKey, enabled, addToast]);

  useEffect(() => { fetchNow(); }, [fetchNow]);

  useEffect(() => {
    // visibilitychange alone covers both tab switches and window focus on
    // modern browsers - using both fired two GETs per refocus.
    function onVisible() { if (!document.hidden) fetchNow(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchNow]);

  const toggle = useCallback(async (idx) => {
    if (!dateKey || !enabled) return;
    const next = checked.includes(idx)
      ? checked.filter(n => n !== idx)
      : [...checked, idx].sort((a, b) => a - b);
    setChecked(next);
    // 10ms blip on supporting devices (Android Chrome). Safari iOS ignores
    // the Vibration API entirely - this is a graceful no-op there.
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
    try {
      await api.putCheckoffs(dateKey, next);
      // Tell sibling hooks (e.g. useMonthCheckoffs feeding the calendar ring)
      // that something changed so they can refetch without polling.
      window.dispatchEvent(new CustomEvent("checkoffs-mutated"));
    } catch {
      addToast("Couldn't save. Your change was reversed");
      fetchNow();
    }
  }, [checked, dateKey, enabled, fetchNow, addToast]);

  return { checked, loading, toggle };
}
