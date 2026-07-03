import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const EMPTY_DAY = { log: null, note: "", plantEntries: [] };
// Anything that changes journal content fires one of these; every journal hook
// refetches. "journal-mutated" is dispatched by the composer on save.
const MUTATION_EVENTS = ["growlog-mutated", "journal-mutated"];

function useMutationTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    for (const ev of MUTATION_EVENTS) window.addEventListener(ev, bump);
    return () => { for (const ev of MUTATION_EVENTS) window.removeEventListener(ev, bump); };
  }, []);
  return tick;
}

// Everything recorded on one day of the grow: daily log + day note + every
// plant's log entries, in one request.
export function useJournalDay(dateKey, enabled, growId) {
  const [day, setDay] = useState(EMPTY_DAY);
  const [loading, setLoading] = useState(true);
  const tick = useMutationTick();

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
export function useJournalMonth(monthKey, enabled, growId) {
  const [days, setDays] = useState({});
  const tick = useMutationTick();

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

// The journal's home feed: pages of day summaries, newest first. loadMore()
// appends the next page; a content mutation reloads from the top.
export function useJournalTimeline(enabled, growId) {
  const [days, setDays] = useState([]);
  const [totalDays, setTotalDays] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const tick = useMutationTick();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    api.getJournalTimeline("", 30, growId)
      .then((d) => {
        if (cancelled) return;
        setDays(d.days || []);
        setTotalDays(d.totalDays || 0);
        setHasMore(Boolean(d.hasMore));
      })
      .catch(() => { if (!cancelled) { setDays([]); setHasMore(false); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, growId, tick]);

  const loadMore = useCallback(() => {
    setDays((current) => {
      const before = current.length ? current[current.length - 1].date : "";
      if (!before) return current;
      setLoadingMore(true);
      api.getJournalTimeline(before, 30, growId)
        .then((d) => {
          setDays((prev) => {
            const seen = new Set(prev.map((x) => x.date));
            return [...prev, ...(d.days || []).filter((x) => !seen.has(x.date))];
          });
          setHasMore(Boolean(d.hasMore));
        })
        .catch(() => {})
        .finally(() => setLoadingMore(false));
      return current;
    });
  }, [growId]);

  return { days, totalDays, hasMore, loading, loadingMore, loadMore };
}
