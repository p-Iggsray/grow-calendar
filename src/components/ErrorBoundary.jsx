import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0e1a12",
        fontFamily: "'Courier New', monospace",
        color: "#f0ebe0",
        padding: 24,
        textAlign: "center",
        gap: 20,
      }}>
        <div style={{ fontSize: 36 }}>🌿</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#e8f5e3", letterSpacing: 1 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 12, color: "#5a8a5a", maxWidth: 300, lineHeight: 1.7 }}>
          The app hit an unexpected error. Your data is safe — a reload should fix it.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 10, padding: "10px 24px",
            color: "#4ade80", fontSize: 12,
            letterSpacing: 1, cursor: "pointer",
          }}
        >
          RELOAD
        </button>
        <div style={{ fontSize: 10, color: "#2a4a2a", maxWidth: 320, lineHeight: 1.6, marginTop: 8 }}>
          {String(this.state.error)}
        </div>
      </div>
    );
  }
}
