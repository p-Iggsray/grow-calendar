import { useState, useEffect } from "react";
import { getToday } from "./dates-core.js";

// Re-export the pure helpers so existing `from "./dates.js"` imports keep working.
export * from "./dates-core.js";

export function useToday() {
  const [today, setToday] = useState(getToday);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const id = setTimeout(() => setToday(getToday()), midnight - Date.now());
    return () => clearTimeout(id);
  }, [today]);
  return today;
}
