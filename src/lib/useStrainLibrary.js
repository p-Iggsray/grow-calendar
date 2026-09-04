import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { usePlan } from "./usePlan.jsx";
import { buildStrainLibrary, strainNameKey } from "./strainLibrary.js";

// The strain library, assembled from the two places it lives: the spaces you
// already have loaded (which is where the LIST of strains comes from) and the
// saved rows (which is where your opinion of each one comes from).
//
// Saves are optimistic. Tapping a star or a heart should feel like flipping a
// switch, not like filing a form, so the local row changes immediately and the
// request follows; if it fails, the rows go back exactly as they were and the
// error is reported.
export function useStrainLibrary() {
  const { grows } = usePlan();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The rows as they stand right now, for rolling back a failed save without
  // reading state that a re-render may have moved on from.
  const latest = useRef(entries);
  const put = useCallback((next) => { latest.current = next; setEntries(next); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getStrainLibrary()
      .then((d) => { if (!cancelled) { put(d.entries ?? []); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [put]);

  const strains = useMemo(() => buildStrainLibrary(grows, entries), [grows, entries]);

  // The rows with `patch` applied to one strain, creating its row if this is
  // the first thing ever written about it.
  function withPatch(rows, name, patch) {
    const key = strainNameKey(name);
    const i = rows.findIndex((e) => strainNameKey(e.name) === key);
    if (i < 0) return [...rows, { name, note: "", rating: 0, favorite: false, ...patch }];
    const next = rows.slice();
    next[i] = { ...next[i], ...patch, name };
    return next;
  }

  const save = useCallback(async (name, patch) => {
    const before = latest.current;
    put(withPatch(before, name, patch));
    try {
      const d = await api.saveStrainEntry({ name, ...patch });
      // Adopt the server's version of the row, which is the merged truth.
      if (d?.entry) put(withPatch(latest.current, name, d.entry));
      return true;
    } catch (e) {
      put(before);
      setError(e);
      return false;
    }
  }, [put]);

  const forget = useCallback(async (name) => {
    const before = latest.current;
    const key = strainNameKey(name);
    put(before.filter((e) => strainNameKey(e.name) !== key));
    try {
      await api.deleteStrainEntry(name);
      return true;
    } catch (e) {
      put(before);
      setError(e);
      return false;
    }
  }, [put]);

  return { strains, loading, error, save, forget, clearError: useCallback(() => setError(null), []) };
}
