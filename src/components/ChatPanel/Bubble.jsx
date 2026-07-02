import { MONO } from "./constants.js";
import MdInline from "./MdInline.jsx";

// The app shows no em or en dashes. MJ's model output (and older stored chat
// history) can contain them, so scrub assistant text at render time. User text
// is left exactly as typed.
function deDash(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\s*\u2014\s*/g, " - ").replace(/\s+\u2013\s+/g, " - ").replace(/\u2013/g, "-");
}

export default function Bubble({ role, text, dim, imagePreview, actions, showUndo, onUndo }) {
  const isUser = role === "user";
  const shown = isUser ? text : deDash(text);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      {/* Photo thumbnail in user bubble */}
      {isUser && imagePreview && (
        <img
          src={imagePreview}
          alt="Attached photo"
          style={{
            maxHeight: 220, maxWidth: "85%", borderRadius: 12,
            objectFit: "contain", marginBottom: text ? 4 : 0, display: "block",
          }}
        />
      )}
      {/* Only render text bubble if there's text content */}
      {(text || !imagePreview || !isUser) && (
        <div style={{
          maxWidth: "85%", whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 15,
          padding: "11px 14px", borderRadius: 18,
          background: isUser ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${isUser ? "rgba(34,197,94,0.3)" : "var(--c-surface-2)"}`,
          color: dim ? "var(--c-text-faint)" : (isUser ? "var(--c-text)" : "var(--c-text-dim)"),
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
        }}>
          {isUser ? shown : dim ? shown : <MdInline text={shown} />}
        </div>
      )}
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "85%" }}>
          {actions.map((a, i) => {
            if (a.undone) {
              return (
                <span key={i} style={{
                  fontSize: 11, fontFamily: MONO, color: "var(--c-text-faint)",
                  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                  borderRadius: 8, padding: "4px 9px",
                }}>↩ Undone</span>
              );
            }
            const isNote = a.type === "replace_note";
            const canUndo = showUndo && !!a.undoPayload;
            return (
              <span key={i} style={{
                fontSize: 11, fontFamily: MONO,
                color: isNote ? "#fbbf24" : "var(--c-accent)",
                background: isNote ? "rgba(251,191,36,0.1)" : "rgba(34,197,94,0.1)",
                border: `1px solid ${isNote ? "rgba(251,191,36,0.25)" : "rgba(34,197,94,0.25)"}`,
                borderRadius: 8, padding: "4px 9px",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {a.type === "replace_note" ? "✏️"
                  : a.type === "append_note" ? "📝"
                  : a.type === "update_grow_info" ? "🌿"
                  : a.type === "update_grow_dates" ? "📅"
                  : a.type === "update_phase_tasks" ? "📋"
                  : "✓"} {a.summary}
                {canUndo && (
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => onUndo(i, a.undoPayload)}
                    style={{
                      background: "none", border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 5, color: "rgba(255,255,255,0.45)", fontSize: 11,
                      fontFamily: MONO, letterSpacing: 0.5,
                      padding: "1px 6px", cursor: "pointer", lineHeight: 1.4,
                    }}
                  >Undo</button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
