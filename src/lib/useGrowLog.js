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
export function useGrowLog(date, enabled, growId) {
  const [entry, setEntry] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const dateKey = date ? ymd(date) : null;
  const saveTimer = useRef(null);
  const pendingEntry = useRef(null);
  const pendingKey = useRef(null);
  const requestId = useRef(0);

  // Immediately persist any pending debounced edit. Called when the day changes
  // or the hook unmounts so switching days never silently drops an unsaved edit
  // (the next setFields would otherwise clear the timer for the old day).
  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const key = pendingKey.current;
    const pending = pendingEntry.current;
    pendingKey.current = null;
    pendingEntry.current = null;
    if (key && pending) api.putGrowLog(key, pending, growId).catch(() => {});
  }, [growId]);

  useEffect(() => {
    if (!dateKey || !enabled) { setEntry(EMPTY); setStatus(null); return; }
    const myId = ++requestId.current;
    setStatus(null);
    api.getGrowLog(dateKey, growId)
      // Ignore out-of-order responses: a slow request for a previous day must
      // not overwrite the day the user is now looking at.
      .then(data => { if (myId === requestId.current) setEntry(data.entry ? entryFromApi(data.entry) : EMPTY); })
      .catch(() => {});
    return () => { flush(); };
  }, [dateKey, enabled, growId, flush]);

  // Merge one or more fields and schedule a single debounced save.
  const setFields = useCallback((partial) => {
    setEntry(prev => {
      const next = { ...prev, ...partial };
      pendingEntry.current = next;
      pendingKey.current = dateKey;
      return next;
    });

    clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const key = pendingKey.current;
      if (!key) return;
      const payload = pendingEntry.current;
      pendingKey.current = null;
      pendingEntry.current = null;
      saveTimer.current = null;
      try {
        await api.putGrowLog(key, payload, growId);
        setStatus("saved");
        setTimeout(() => setStatus(s => s === "saved" ? null : s), 2000);
      } catch {
        setStatus("error");
      }
    }, 800);
  }, [dateKey, growId]);

  const setField = useCallback((name, value) => setFields({ [name]: value }), [setFields]);

  return { entry, setField, setFields, status };
}
