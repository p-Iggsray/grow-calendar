import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

const DEBOUNCE_MS = 800;

// Per-day note with debounced autosave. Mirrors useCheckoffs:
//   - loads on date/enabled change, guarding stale responses
//   - keeps live text in state for instant typing
//   - autosaves DEBOUNCE_MS after the last keystroke; flush() saves immediately
// status is one of: "idle" | "saving" | "saved" | "error"
export function useDayNote(date, enabled) {
  const [note, setNoteState] = useState("");
  const [status, setStatus] = useState("idle");
  const dateKey = date ? ymd(date) : null;

  const requestId = useRef(0);
  const saveTimer = useRef(null);
  const latest = useRef("");   // most recent text the user has typed
  const dirty = useRef(false); // true when latest differs from what is saved

  const doSave = useCallback(async () => {
    if (!dateKey || !enabled || !dirty.current) return;
    const text = latest.current;
    // Optimistically mark clean BEFORE the request so a concurrent effect-cleanup
    // flush (fires when navigating away clears the date) doesn't dispatch a
    // duplicate save for the same text. Restored on failure so a retry can fire.
    dirty.current = false;
    setStatus("saving");
    try {
      await api.putNote(dateKey, text);
      setStatus(latest.current === text ? "saved" : "saving");
    } catch {
      dirty.current = true;
      setStatus("error");
    }
  }, [dateKey, enabled]);

  // Load the note when the selected day (or auth) changes.
  useEffect(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    dirty.current = false;
    latest.current = "";
    if (!dateKey || !enabled) { setNoteState(""); setStatus("idle"); return undefined; }

    const myId = ++requestId.current;
    setStatus("idle");
    (async () => {
      try {
        const data = await api.getNote(dateKey);
        if (myId === requestId.current && !dirty.current) {
          setNoteState(data.body || "");
          latest.current = data.body || "";
        }
      } catch {
        // leave the box empty; user can still type and save
      }
    })();

    // On day change OR unmount, flush any pending edit for THIS day before
    // moving on. doSave here is the closure bound to the current dateKey, so it
    // saves to the correct day. Makes the hook self-sufficient regardless of
    // whether the consumer also calls flush().
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (dirty.current) doSave();
    };
  }, [dateKey, enabled, doSave]);

  const setNote = useCallback((value) => {
    latest.current = value;
    dirty.current = true;
    setNoteState(value);
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, DEBOUNCE_MS);
  }, [doSave]);

  const flush = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    doSave();
  }, [doSave]);

  // Best-effort save when the tab is hidden (mobile background, tab switch).
  useEffect(() => {
    function onHide() { if (document.hidden) flush(); }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  return { note, setNote, status, flush };
}
