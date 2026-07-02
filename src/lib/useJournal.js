import { useEffect, useState } from "react";
import { api } from "./api.js";

const EMPTY_DAY = { log: null, note: "", plantEntries: [] };

// Everything recorded on one day of the grow: daily log + day note + every
// plant's log entries, in one request. Re-fetches when the day log is saved
// elsewhere (DayView autosave dispatches "growlog-mutated").
export function useJournalDay(dateKey, enabled, growId) {
  const [day, setDay] = useState(EMPTY_DAY);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onMutated = () => setTick((t) => t + 1);
    window.addEventListener("growlog-mutated", onMutated);
    return () => window.removeEventListener("growlog-mutated", onMutated);
  }, []);

  useEffect(() => {
    if (!dateKey || !enabled) return;
    let cancelled = false;
    setLoading(true);
    api.getJournalDay(dateKey, growId)
      .then((d) => {
        if (cancelled) return;
        setDay({ log: d.log ?? null, note: d.note || "", plantEntries: d.plantEntries || [] });
      })
      .catch(() => { if (!cancelled) setDay(EMPTY_DAY); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateKey, enabled, growId, tick]);

  return { day, loading };
}

// Which days of a month hold journal content: { "YYYY-MM-DD": {log, note, plants} }.
// Powers the jump-to-day strip.
export function useJournalMonth(monthKey, enabled, growId) {
  const [days, setDays] = useState({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onMutated = () => setTick((t) => t + 1);
    window.addEventListener("growlog-mutated", onMutated);
    return () => window.removeEventListener("growlog-mutated", onMutated);
  }, []);

  useEffect(() => {
    if (!monthKey || !enabled) return;
    let cancelled = false;
    api.getJournalMonth(monthKey, growId)
      .then((d) => { if (!cancelled) setDays(d.days || {}); })
      .catch(() => { if (!cancelled) setDays({}); });
    return () => { cancelled = true; };
  }, [monthKey, enabled, growId, tick]);

  return days;
}
