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
        background: "var(--c-bg)",
        fontFamily: "'Courier New', monospace",
        color: "var(--c-text)",
        padding: 24,
        textAlign: "center",
        gap: 20,
      }}>
        <div style={{ fontSize: 36 }}>🌿</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)", letterSpacing: 1 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 12, color: "var(--c-text-faint)", maxWidth: 300, lineHeight: 1.7 }}>
          The app hit an unexpected error. Your data is safe. A reload should fix it.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="touch-target"
          style={{
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 10, padding: "10px 24px",
            color: "var(--c-accent)", fontSize: 12,
            letterSpacing: 1, cursor: "pointer",
          }}
        >
          RELOAD
        </button>
        <div style={{ fontSize: 11, color: "var(--c-text-faint)", maxWidth: 320, lineHeight: 1.6, marginTop: 8 }}>
          {String(this.state.error)}
        </div>
      </div>
    );
  }
}
