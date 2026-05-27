import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LoginGate from "./components/LoginGate.jsx";
import PendingScreen from "./components/PendingScreen.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Toast from "./components/Toast.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { ToastProvider } from "./lib/useToast.jsx";
import { PlanProvider } from "./lib/usePlan.jsx";
import "./styles.css";

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <LoginGate />;
  if (user.status !== "approved") return <PendingScreen />;
  return (
    <PlanProvider>
      <App />
    </PlanProvider>
  );
}

function Splash() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0e1a12",
      fontFamily: "'Courier New', monospace",
      fontSize: 12, letterSpacing: 4, color: "#3a5a3a",
    }}>
      LOADING
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
        <Toast />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
