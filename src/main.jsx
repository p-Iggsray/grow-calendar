import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import LoginGate from "./components/LoginGate.jsx";
import PendingScreen from "./components/PendingScreen.jsx";
import Splash from "./components/Splash.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Toast from "./components/Toast.jsx";
import BuddyView from "./components/BuddyView.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { ToastProvider } from "./lib/useToast.jsx";
import { PlanProvider } from "./lib/usePlan.jsx";
import { api } from "./lib/api.js";
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
// the auth/login chunk — not the entire calendar engine.
const App = lazy(() => import("./App.jsx"));

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <LoginGate />;
  if (user.status !== "approved") return <PendingScreen />;
  return (
    <PlanProvider>
      <Suspense fallback={<Splash />}>
        <App />
      </Suspense>
    </PlanProvider>
  );
}

// Register service worker for offline caching and push notifications.
// updateViaCache:"none" tells the browser to always fetch sw.js from the
// network (not its HTTP cache) so new deploys are detected immediately.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => {});
  });
}

// Detect buddy / share-link routes before mounting the auth stack.
const _shareMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{10,60})$/);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        {_shareMatch ? (
          <BuddyView token={_shareMatch[1]} />
        ) : (
          <AuthProvider>
            <Root />
          </AuthProvider>
        )}
        <Toast />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
