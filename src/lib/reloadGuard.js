// Holding off the reload a new deploy asks for.
//
// When a new build's service worker takes over, the page reloads itself so the
// installed app never runs stale code (see main.jsx). Checks for a new build
// run every time the app comes back into view, and coming back from the photo
// picker or the camera counts. So a deploy landing while someone was choosing
// a video reloaded the page out from under the upload: a blank screen, and the
// video gone.
//
// Anything that must not be interrupted holds the reload. When the last hold
// lets go, the reload still does not fire in the grower's face: it waits for
// the app to go into the background, so the upload's own result (or its
// error) stays on screen. Pure apart from the callbacks it is handed.

let holds = 0;
let pending = null;
// How a reload that had to wait is finally run. The app replaces this with
// "when the page is next hidden"; tests leave it immediate.
let runDeferred = (run) => run();

/** Set how a reload that waited for a hold is run (see main.jsx). */
export function deferReloadWith(schedule) {
  runDeferred = schedule;
}

/** Hold the reload. Returns the function that lets go, safe to call twice. */
export function holdReload() {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0 && pending) {
      const run = pending;
      pending = null;
      // By the time the deferral fires, something may hold the reload again
      // (the next upload, or the picker open for the next clip). Then it goes
      // back to waiting rather than reloading under it.
      runDeferred(() => reloadWhenIdle(run));
    }
  };
}

/** Run `reload` now, or as soon as nothing is holding it. */
export function reloadWhenIdle(reload) {
  if (holds === 0) reload();
  else pending = reload;
}

/** For tests. */
export function reloadHolds() {
  return holds;
}
