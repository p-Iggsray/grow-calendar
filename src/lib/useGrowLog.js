import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

const EMPTY = { water_gal: "", feed: "", temp_high: "", temp_low: "", humidity: "" };

function entryFromApi(e) {
  return {
    water_gal: e.water_gal != null ? String(e.water_gal) : "",
    feed:      e.feed      ?? "",
    temp_high: e.temp_high != null ? String(e.temp_high) : "",
    temp_low:  e.temp_low  != null ? String(e.temp_low)  : "",
    humidity:  e.humidity  != null ? String(e.humidity)  : "",
  };
}

/**
 * Loads and saves the grow log entry for a single day.
 * Returns { entry, setField, status }.
 * status: null | "saving" | "saved" | "error"
 */
export function useGrowLog(date, enabled) {
  const [entry, setEntry] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const dateKey = date ? ymd(date) : null;
  const saveTimer = useRef(null);
  const pendingEntry = useRef(null);

  useEffect(() => {
    if (!dateKey || !enabled) { setEntry(EMPTY); return; }
    api.getGrowLog(dateKey)
      .then(data => setEntry(data.entry ? entryFromApi(data.entry) : EMPTY))
      .catch(() => {});
  }, [dateKey, enabled]);

  const setField = useCallback((name, value) => {
    setEntry(prev => {
      const next = { ...prev, [name]: value };
      pendingEntry.current = next;
      return next;
    });

    clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      if (!dateKey) return;
      try {
        await api.putGrowLog(dateKey, pendingEntry.current);
        setStatus("saved");
        setTimeout(() => setStatus(s => s === "saved" ? null : s), 2000);
      } catch {
        setStatus("error");
      }
    }, 800);
  }, [dateKey]);

  return { entry, setField, status };
}
