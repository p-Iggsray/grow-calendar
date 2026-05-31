import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";
import { useToast } from "./useToast.jsx";

const VALID_STATES = new Set(["done", "skipped", "blocked"]);

export function useCheckoffs(date, enabled) {
  // taskStates: { "0": "done", "2": "skipped" } — keyed by string task index
  const [taskStates, setTaskStates] = useState({});
  const [loading, setLoading] = useState(false);
  const dateKey = date ? ymd(date) : null;
  const requestId = useRef(0);
  const { addToast } = useToast();

  const fetchNow = useCallback(async () => {
    if (!dateKey || !enabled) { setTaskStates({}); return; }
    const myId = ++requestId.current;
    setLoading(true);
    try {
      const data = await api.getCheckoffs(dateKey);
      if (myId === requestId.current) {
        // Prefer taskStates (new format); fall back to legacy checked array.
        if (data.taskStates && typeof data.taskStates === "object") {
          setTaskStates(data.taskStates);
        } else if (Array.isArray(data.checked)) {
          setTaskStates(Object.fromEntries(data.checked.map(i => [String(i), "done"])));
        } else {
          setTaskStates({});
        }
      }
    } catch {
      if (myId === requestId.current) addToast("Couldn't load tasks. Check your connection");
    } finally {
      if (myId === requestId.current) setLoading(false);
    }
  }, [dateKey, enabled, addToast]);

  useEffect(() => { fetchNow(); }, [fetchNow]);

  useEffect(() => {
    function onVisible() { if (!document.hidden) fetchNow(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchNow]);

  /** Optimistically update local state and persist to the server. */
  const applyState = useCallback(async (idx, nextStates) => {
    setTaskStates(nextStates);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
    try {
      await api.putCheckoffs(dateKey, nextStates);
      window.dispatchEvent(new CustomEvent("checkoffs-mutated"));
    } catch {
      addToast("Couldn't save. Your change was reversed");
      fetchNow();
    }
  }, [dateKey, fetchNow, addToast]);

  /** Tap: toggle between "done" and unset. Any other state → unset. */
  const toggle = useCallback(async (idx) => {
    if (!dateKey || !enabled) return;
    const key = String(idx);
    const next = { ...taskStates };
    if (next[key]) delete next[key];
    else next[key] = "done";
    await applyState(idx, next);
  }, [taskStates, dateKey, enabled, applyState]);

  /** Long-press: set a specific state, or pass null to clear. */
  const setTaskState = useCallback(async (idx, state) => {
    if (!dateKey || !enabled) return;
    const key = String(idx);
    const next = { ...taskStates };
    if (state === null || !VALID_STATES.has(state)) delete next[key];
    else next[key] = state;
    await applyState(idx, next);
  }, [taskStates, dateKey, enabled, applyState]);

  return { taskStates, loading, toggle, setTaskState };
}
