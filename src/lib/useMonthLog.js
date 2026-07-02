import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Which days of a month have a filled-out daily log. Drives the calendar's
// completion rings: a logged day shows a full ring, an unlogged day shows none.
export function useMonthLog(year, month, enabled, growId) {
  const [days, setDays] = useState({});
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const fetchNow = useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    api.getMonthGrowLog(monthKey, growId)
      .then(d => { if (!cancelled) setDays(d.days ?? {}); })
      .catch(() => { /* keep last known */ });
    return () => { cancelled = true; };
  }, [monthKey, enabled, growId]);

  useEffect(() => {
    setDays({});
    return fetchNow();
  }, [fetchNow]);

  // Refresh when a log is saved anywhere in the app.
  useEffect(() => {
    if (!enabled) return;
    const onMutate = () => fetchNow();
    window.addEventListener("growlog-mutated", onMutate);
    return () => window.removeEventListener("growlog-mutated", onMutate);
  }, [enabled, fetchNow]);

  return { days };
}
