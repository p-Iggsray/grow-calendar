import { useCallback, useEffect, useRef, useState } from "react";
import { api, ymd } from "./api.js";

export const MAX_TASK_NOTE_LEN = 280;

/**
 * Loads and saves per-task notes for a single day.
 * Returns { notes, setNote } where notes is { "0": "text", "2": "text" }.
 */
export function useTaskNotes(date, enabled, growId) {
  const [notes, setNotes] = useState({});
  const dateKey = date ? ymd(date) : null;
  const saveTimers = useRef({});

  useEffect(() => {
    if (!dateKey || !enabled) { setNotes({}); return; }
    api.getTaskNotes(dateKey, growId)
      .then(data => setNotes(data.notes || {}))
      .catch(() => {});
  }, [dateKey, enabled, growId]);

  const setNote = useCallback((taskIndex, text) => {
    const key = String(taskIndex);
    setNotes(prev => ({ ...prev, [key]: text }));

    // Debounce saves: 800ms after last keystroke.
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => {
      if (dateKey) api.putTaskNote(dateKey, taskIndex, text, growId).catch(() => {});
    }, 800);
  }, [dateKey, growId]);

  return { notes, setNote };
}
