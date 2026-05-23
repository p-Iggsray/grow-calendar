import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LoginGate from "./components/LoginGate.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import "./styles.css";

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user)   return <LoginGate />;
  return <App />;
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
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>
);
