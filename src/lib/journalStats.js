import { ymd } from "./api.js";

// Consecutive days journaled, counting back from today. A day still counts
// toward the streak if today itself has no entry yet (the streak is "alive",
// it just has not grown today).
export function journalStreak(dateKeys, today) {
  const set = new Set(dateKeys);
  const probe = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(ymd(probe))) probe.setDate(probe.getDate() - 1);
  let streak = 0;
  while (set.has(ymd(probe))) {
    streak++;
    probe.setDate(probe.getDate() - 1);
  }
  return streak;
}
