// What the launch already showed, and how long to hold the opening.
//
// Two things the app can only know at the moment it boots, kept together
// because they are the same question asked twice: what has this person already
// seen?
//
// ── The hold ──────────────────────────────────────────────────────────────
//
// The opening used to be held for a flat 1900ms so the animation always played
// through. Measured against the real worker with real data, on a phone-sized
// viewport with the CPU throttled, that hold never once covered work:
//
//   cold, 4x CPU, 4G      app painted at  820ms, overlay lifted at 2843ms
//   warm, 4x CPU, 4G      app painted at  542ms, overlay lifted at 2610ms
//   cold, 6x CPU, 3G      app painted at 2012ms, overlay lifted at 3569ms
//   cold, 6x CPU, 400kbps app painted at 4836ms, overlay lifted at 5687ms
//
// There is no condition, down to 400kbps with six times the CPU throttling,
// where the app was not finished well before the hold expired. So the hold is
// not a loading screen. It is a title card, and a title card that plays every
// single time somebody glances at their phone is a toll.
//
// So it is full length on a cold launch, which is the one that is actually an
// opening, and short on every launch after.
//
// ── What counts as warm ───────────────────────────────────────────────────
//
// Two signals, either of which means this person has opened the app here
// before: a flag in localStorage, and a service worker already controlling the
// page. The flag is the honest answer and survives a hard reload, which drops
// the controller. The controller catches the case where storage was cleared but
// the shell is still cached. If both are missing the launch is treated as cold,
// which is the safe direction: the worst outcome is that somebody sees the full
// opening once more than they had to.

import { MARK_ID } from "./splashPrepaint.js";

/** A launch that is genuinely an opening. */
export const COLD_HOLD_MS = 1900;
/** Every launch after the first: long enough to read, short enough not to grate. */
export const WARM_HOLD_MS = 600;
/** No animation to wait for, so this is just long enough not to flash. */
export const REDUCED_HOLD_MS = 350;

/**
 * How long to hold the opening. Pure, so the decision can be tested without a
 * browser.
 * @param {{warm?: boolean, reduce?: boolean}} opts
 */
export function holdMs({ warm = false, reduce = false } = {}) {
  if (reduce) return REDUCED_HOLD_MS;
  return warm ? WARM_HOLD_MS : COLD_HOLD_MS;
}

const LAUNCHED_KEY = "bcb.launched";

function readWarm() {
  try {
    if (localStorage.getItem(LAUNCHED_KEY)) return true;
  } catch { /* private mode, blocked storage: fall through to the worker */ }
  try {
    return Boolean(navigator.serviceWorker?.controller);
  } catch { return false; }
}

let _warm = null;

/**
 * Whether this person has launched the app on this device before, answered
 * once and then remembered.
 *
 * Memoised because the first call is also what records the launch, and
 * StrictMode runs effects twice in development: without this the second run
 * would see the flag the first run just wrote and give a different answer.
 */
export function warmLaunch() {
  if (_warm === null) {
    _warm = readWarm();
    try { localStorage.setItem(LAUNCHED_KEY, "1"); } catch { /* nothing to do */ }
  }
  return _warm;
}

// ── The pre-React paint ──────────────────────────────────────

/**
 * Whether index.html already put the opening on screen.
 *
 * Read at import time, which is before createRoot() clears the container.
 *
 * Splash uses it to skip its own entrance. The mark is already there, at full
 * opacity, in the document's first paint; animating it in from nothing at that
 * point would fade a visible thing out and back, which is worse than not
 * animating it at all.
 */
export const PREPAINTED =
  typeof document !== "undefined" && Boolean(document.getElementById(MARK_ID));
