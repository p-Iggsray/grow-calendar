import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import LoginGate from "./components/LoginGate.jsx";
import PendingScreen from "./components/PendingScreen.jsx";
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

function Splash() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--c-bg)",
      fontFamily: "'Courier New', monospace",
      fontSize: 12, letterSpacing: 4, color: "var(--c-text-ghost)",
    }}>
      LOADING
    </div>
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

    // When a new SW takes control, reload so the page loads fresh assets.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
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
