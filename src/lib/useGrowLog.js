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
  // Only the fields touched since the last save. A day's log is edited from
  // several cards at once and rewritten behind our back by a reading of the
  // day's entry, so sending the whole entry would push a stale copy of
  // everything this card never showed.
  const pendingPatch = useRef(null);
  const pendingKey = useRef(null);
  const requestId = useRef(0);

  // Immediately persist any pending debounced edit. Called when the day changes
  // or the hook unmounts so switching days never silently drops an unsaved edit
  // (the next setFields would otherwise clear the timer for the old day).
  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const key = pendingKey.current;
    const patch = pendingPatch.current;
    pendingKey.current = null;
    pendingPatch.current = null;
    if (key && patch) api.putGrowLog(key, patch, growId).catch(() => {});
  }, [growId]);

  const load = useCallback(() => {
    if (!dateKey || !enabled) { setEntry(EMPTY); setStatus(null); return; }
    const myId = ++requestId.current;
    api.getGrowLog(dateKey, growId)
      // Ignore out-of-order responses: a slow request for a previous day must
      // not overwrite the day the user is now looking at. A dirty local edit
      // (pending debounced save) also wins over the fetch - the server copy is
      // older than what is on screen.
      .then(data => {
        if (myId !== requestId.current || pendingPatch.current) return;
        setEntry(data.entry ? entryFromApi(data.entry) : EMPTY);
      })
      .catch(() => {});
  }, [dateKey, enabled, growId]);

  useEffect(() => {
    setStatus(null);
    load();
    return () => { flush(); };
  }, [load, flush]);

  // Something else changed this day's log: a reading of the written entry, the
  // plant screen, the other card on this page. Pick the new row up rather than
  // sitting on the copy fetched at mount, which is the copy a later edit would
  // otherwise be built on.
  useEffect(() => {
    if (!dateKey || !enabled) return undefined;
    const onChange = (e) => { if (e?.detail?.from !== "useGrowLog") load(); };
    window.addEventListener("growlog-mutated", onChange);
    return () => window.removeEventListener("growlog-mutated", onChange);
  }, [dateKey, enabled, load]);

  // Merge one or more fields and schedule a single debounced save.
  const setFields = useCallback((partial) => {
    setEntry(prev => ({ ...prev, ...partial }));
    pendingPatch.current = { ...(pendingPatch.current ?? {}), ...partial };
    pendingKey.current = dateKey;

    clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const key = pendingKey.current;
      if (!key) return;
      const payload = pendingPatch.current;
      pendingKey.current = null;
      pendingPatch.current = null;
      saveTimer.current = null;
      try {
        await api.putGrowLog(key, payload, growId);
        // Let the calendar's logged-day rings refresh immediately. The detail
        // says who fired it so this hook does not refetch over its own save.
        window.dispatchEvent(new CustomEvent("growlog-mutated", { detail: { from: "useGrowLog" } }));
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
