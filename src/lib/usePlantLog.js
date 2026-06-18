import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Loads and mutates a single plant's log. Refetches after each mutation so the
// list stays consistent with the server (entries arrive date DESC).
export function usePlantLog(growId, plantId, enabled) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!growId || !plantId || !enabled) { setEntries([]); return; }
    setLoading(true);
    api.getPlantLog(growId, plantId)
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [growId, plantId, enabled]);

  useEffect(() => { reload(); }, [reload]);

  const addEntry = useCallback(async (entry) => {
    await api.addPlantLogEntry(growId, plantId, entry);
    reload();
  }, [growId, plantId, reload]);

  const editEntry = useCallback(async (entryId, patch) => {
    await api.patchPlantLogEntry(growId, plantId, entryId, patch);
    reload();
  }, [growId, plantId, reload]);

  const removeEntry = useCallback(async (entryId) => {
    await api.deletePlantLogEntry(growId, plantId, entryId);
    reload();
  }, [growId, plantId, reload]);

  return { entries, loading, addEntry, editEntry, removeEntry, reload };
}
