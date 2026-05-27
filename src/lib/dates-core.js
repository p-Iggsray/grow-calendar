// Pure date helpers. No React, no DOM - safe to import in the Cloudflare Worker.
export function getToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

export const fmt  = d => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
export const fmtL = d => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
