// When the record was last copied somewhere that is not Cloudflare.
//
// A backup you have to remember is a backup that does not happen, so Settings
// says how long it has been. The date lives in localStorage rather than the
// database on purpose: it is a fact about THIS phone having a copy, and a
// device that has never downloaded one should say so even though the server
// knows another device has.

const KEY = "bcb-last-backup";

export function loadLastBackup() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw : null;
  } catch { return null; }
}

export function rememberBackup(iso = new Date().toISOString()) {
  try { localStorage.setItem(KEY, iso); } catch { /* private mode */ }
}

/**
 * How the Settings row reads under the label.
 *
 * `days` is how long ago, so the caller can also decide how loudly to say it.
 * Never backed up is the case worth nagging about, and it is the default.
 */
export function backupAge(lastIso, now = new Date()) {
  if (!lastIso) return { text: "Never backed up on this device", days: Infinity, stale: true };
  const then = new Date(lastIso);
  if (Number.isNaN(then.getTime())) return { text: "Never backed up on this device", days: Infinity, stale: true };

  const days = Math.floor((now - then) / 86400000);
  const text =
    days <= 0 ? "Backed up today"
    : days === 1 ? "Backed up yesterday"
    : days < 31 ? `Backed up ${days} days ago`
    : days < 62 ? "Backed up over a month ago"
    : `Backed up over ${Math.floor(days / 30)} months ago`;
  return { text, days, stale: days >= 30 };
}
