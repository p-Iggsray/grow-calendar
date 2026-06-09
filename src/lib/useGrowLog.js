import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

const EMPTY = {
  water_gal: "", feed: "", temp_high: "", temp_low: "", humidity: "",
  water_plants: [],
  training: [],
  plant_health: [],
};

function tryParseArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function entryFromApi(e) {
  return {
    water_gal:    e.water_gal    != null ? String(e.water_gal)    : "",
    feed:         e.feed         ?? "",
    temp_high:    e.temp_high    != null ? String(e.temp_high)    : "",
    temp_low:     e.temp_low     != null ? String(e.temp_low)     : "",
    humidity:     e.humidity     != null ? String(e.humidity)     : "",
    water_plants: tryParseArray(e.water_plants),
    training:     tryParseArray(e.training),
    plant_health: tryParseArray(e.plant_health),
  };
}

/**
 * Loads and auto-saves the grow log for a single day.
 * setField(name, value) works for both scalar (string/number) and array values.
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

  // Merge one or more fields and schedule a single debounced save.
  const setFields = useCallback((partial) => {
    setEntry(prev => {
      const next = { ...prev, ...partial };
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

  const setField = useCallback((name, value) => setFields({ [name]: value }), [setFields]);

  return { entry, setField, setFields, status };
}
