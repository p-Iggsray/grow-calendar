import { useState } from "react";

const UI = "var(--font-ui)";

// A normal text box you type into, with matching suggestions underneath.
//
// Names are the grower's own words, so typing always comes first here - unlike
// ChoiceField, which leads with a list. Suggestions only assist.
export default function AutocompleteInput({
  value,
  onChange,
  onPick,
  suggestions = [],
  getLabel = (s) => s,
  getDetail = () => "",
  placeholder,
  maxSuggestions = 6,
}) {
  const [focused, setFocused] = useState(false);

  const q = String(value ?? "").trim().toLowerCase();
  const matches = !focused || q.length < 1
    ? []
    : suggestions
      .filter((s) => {
        const label = String(getLabel(s) ?? "").toLowerCase();
        return label.includes(q) && label !== q;
      })
      .slice(0, maxSuggestions);

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
          border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
          padding: "12px 14px", fontSize: 16, fontFamily: UI, outline: "none",
        }}
      />
      {matches.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, marginTop: 4,
          background: "var(--c-panel-bg)", border: "1px solid var(--c-border-strong)",
          borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
        }}>
          {matches.map((s, i) => (
            <button
              key={getLabel(s) + i}
              type="button"
              // mousedown fires before blur, so the pick is not lost.
              onMouseDown={(e) => { e.preventDefault(); onPick ? onPick(s) : onChange(getLabel(s)); setFocused(false); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                width: "100%", textAlign: "left", padding: "11px 13px", cursor: "pointer",
                background: "none", border: "none", borderBottom: "1px solid var(--c-border-faint)",
                color: "var(--c-text)", fontFamily: UI, fontSize: 14,
              }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {getLabel(s)}
              </span>
              {getDetail(s) && (
                <span style={{ flexShrink: 0, fontSize: 11.5, color: "var(--c-text-faint)" }}>
                  {getDetail(s)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
