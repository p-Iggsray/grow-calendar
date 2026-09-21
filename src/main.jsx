import { StrictMode, lazy, Suspense, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "framer-motion";
import LoginGate from "./components/LoginGate.jsx";
import Splash from "./components/Splash.jsx";
import { AppShellSkeleton } from "./components/LoadingScreens.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Toast from "./components/Toast.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { ToastProvider } from "./lib/useToast.jsx";
import { PlanProvider } from "./lib/usePlan.jsx";
import { holdMs, warmLaunch } from "./lib/launch.js";
import { api } from "./lib/api.js";

// The friend view is its own chunk. It is a whole second app, and the grower
// opening their own calendar should not download it to get there.
const BuddyView = lazy(() => import("./components/Buddy/BuddyView.jsx"));
import "./styles.css";

// Report unhandled JS errors to /api/errors for observability.
// Capped at 5 per session so a storm of identical errors doesn't spam the DB.
let _errCount = 0;
function _captureError(message, stack) {
  if (++_errCount > 5) return;
  api.reportError({
    message: String(message).slice(0, 1000),
    stack: stack ? String(stack).slice(0, 2000) : undefined,
    url: location.href.slice(0, 500),
  });
}
window.onerror = (_msg, _src, _line, _col, err) => {
  _captureError(err?.message || String(_msg), err?.stack);
};
window.addEventListener("unhandledrejection", (e) => {
  const err = e.reason;
  _captureError(err?.message || String(err), err?.stack);
});

// Block iOS Safari pinch-zoom. iOS ignores the viewport's user-scalable=no, but
// it still fires gesture* events for pinch, so we cancel them. Also guard against
// double-tap zoom, which touch-action handles on modern browsers but not all.
["gesturestart", "gesturechange", "gestureend"].forEach((evt) =>
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
);
let _lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - _lastTouchEnd < 300) e.preventDefault();
    _lastTouchEnd = now;
  },
  { passive: false }
);

// Lazy-load the full calendar app so logged-out and pending users only receive
// the auth/login chunk - not the entire calendar engine.
const App = lazy(() => import("./App.jsx"));

// One persistent intro overlay that sits above everything and fades out once the
// animation has played AND the app underneath is ready. Owning the Splash in a
// single place (rather than rendering it from two branches) means the animation
// mounts once and never restarts mid-play.
//
// How long it is held depends on whether this is the first launch on this
// device. The reasoning, and the measurements behind it, are in
// src/lib/launch.js: the hold has never once been what the app was waiting on.
function IntroGate({ ready }) {
  const reduce = useReducedMotion();
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), holdMs({ warm: warmLaunch(), reduce }));
    return () => clearTimeout(t);
  }, [reduce]);

  const show = !(minElapsed && ready);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          initial={false}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--c-bg)" }}>
          <Splash />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Root() {
  const { user, loading } = useAuth();
  // Render the real content underneath as soon as auth resolves; the intro
  // overlay covers the auth check + app-chunk load and holds for the full
  // animation, then fades to reveal whatever is ready beneath it.
  return (
    <>
      {!loading && (
        !user ? <LoginGate />
        : (
          <PlanProvider>
            <Suspense fallback={<AppShellSkeleton />}>
              <App />
            </Suspense>
          </PlanProvider>
        )
      )}
      <IntroGate ready={!loading} />
    </>
  );
}

// Register service worker for offline caching.
// updateViaCache:"none" tells the browser to always fetch sw.js from the
// network (not its HTTP cache) so new deploys are detected immediately.
//
// Auto-update: the installed (home-screen) app always converges on the latest
// deploy. A freshly-installed worker is promoted immediately (SKIP_WAITING),
// and when it takes control the page reloads once - safe because each build's
// worker pre-caches its own shell during install. Update checks run on every
// open/resume and hourly, so a phone PWA that never fully closes still picks
// up each deploy the next time it is looked at.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const promote = (sw) => sw?.postMessage({ type: "SKIP_WAITING" });
        // A worker already waiting (deploy happened while the app was closed).
        promote(reg.waiting);
        // A worker that finishes installing while the app is open.
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) promote(sw);
          });
        });
        // Re-check for new deploys whenever the app is opened or resumed from
        // the home screen, and hourly while it stays open.
        const check = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
        window.addEventListener("focus", check);
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {});
  });

  // When the new worker takes control, load the new build. Guarded so the
  // very first install (no prior controller) never triggers a reload loop.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// Detect buddy / share-link routes before mounting the auth stack.
const _shareMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{10,60})$/);

// Reduced motion, for the whole app, from one line.
//
// Twenty-five components animate with framer-motion and four of them asked
// whether the device wanted motion. The other twenty-one slid, scaled and flew
// regardless, and the `transition: none` in styles.css never touched them:
// framer-motion animates by writing inline styles from JavaScript, so there is
// no CSS transition there to cancel.
//
// `reducedMotion="user"` is the setting that fixes all of them at once. When
// the device asks for less motion it drops transform and layout animations and
// leaves opacity alone, which is the distinction that matters: a thing that
// fades is telling you it changed, a thing that slides across the screen is
// what makes people ill. Elements snap to their target rather than sticking at
// their starting transform, so a sheet that would have slid up is simply
// already there.
//
// It wraps both apps, because the friend view is somebody else's device and
// their setting counts too.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <ToastProvider>
          {_shareMatch ? (
            <Suspense fallback={<AppShellSkeleton />}>
              <BuddyView token={_shareMatch[1]} />
            </Suspense>
          ) : (
            <AuthProvider>
              <Root />
            </AuthProvider>
          )}
          <Toast />
        </ToastProvider>
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>
);
