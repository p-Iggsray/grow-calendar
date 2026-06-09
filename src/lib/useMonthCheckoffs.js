// @ts-check
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

/**
 * Aggregate per-day checkoff counts for a single calendar month. Used by the
 * calendar's per-cell completion ring (#11). Counts only, not the full index
 * arrays - lighter payload, and the per-day index list still comes from
 * useCheckoffs when the user actually opens a day.
 *
 * Refetches when month changes, when the tab refocuses, and when a sibling
 * dispatches the "checkoffs-mutated" custom event (so toggling a task
 * immediately updates the calendar ring).
 *
 * @param {number} year
 * @param {number} month  0-indexed (JS-style)
 * @param {boolean} enabled
 * @returns {{ counts: Record<string, number> }}
 */
export function useMonthCheckoffs(year, month, enabled, growId) {
  const [counts, setCounts] = useState(/** @type {Record<string, number>} */ ({}));
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const requestId = useRef(0);

  const fetchNow = useCallback(async () => {
    if (!enabled) { setCounts({}); return; }
    const myId = ++requestId.current;
    try {
      const data = await api.getMonthCheckoffs(monthKey, growId);
      if (myId === requestId.current) setCounts(data.counts || {});
    } catch { /* leave previous counts; calendar still works without rings */ }
  }, [monthKey, enabled, growId]);

  useEffect(() => { fetchNow(); }, [fetchNow]);

  useEffect(() => {
    function onVisible() { if (!document.hidden) fetchNow(); }
    function onMutated() { fetchNow(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("checkoffs-mutated", onMutated);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("checkoffs-mutated", onMutated);
    };
  }, [fetchNow]);

  return { counts };
}
