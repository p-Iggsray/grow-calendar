import { useCallback } from "react";
import { Pencil, Check, Minus, X } from "lucide-react";
import { useLongPress } from "./useLongPress.js";

const STATE_CFG = {
  done:    { color: "var(--c-accent)", bg: "rgba(74,222,128,0.05)",  label: null,      textColor: "#5a7a5a" },
  skipped: { color: "var(--c-warn)", bg: "rgba(250,204,21,0.05)",  label: "SKIPPED", textColor: "#8a8060" },
  blocked: { color: "var(--c-danger)", bg: "rgba(248,113,113,0.05)", label: "BLOCKED", textColor: "#8a6060" },
};

export function TaskRow({ task, index, state, accentColor, onTap, onLongPress, onEditTask, isEdited }) {
  const handleLongPress = useCallback(() => onLongPress(index), [onLongPress, index]);
  const { handlers: lpHandlers, didLongPress } = useLongPress(handleLongPress, 500);

  const handleClick = useCallback(() => {
    if (didLongPress()) return;
    onTap(index);
  }, [didLongPress, onTap, index]);

  const cfg = state ? STATE_CFG[state] : null;

  return (
    <div style={{ borderRadius: 8, overflow: "hidden" }}>
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: cfg?.bg ?? "transparent",
        padding: "6px 4px",
      }}>
        {/* Checkbox: tap toggles done, long-press opens state picker */}
        <button
          type="button"
          className="touch-target"
          onClick={handleClick}
          {...lpHandlers}
          style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: cfg ? cfg.color : `${accentColor}22`,
            color: cfg ? "var(--c-bg)" : accentColor,
            border: `1px solid ${cfg ? cfg.color : accentColor + "44"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s, color 0.15s",
            fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 800,
          }}>
          {state === "done"    ? <Check size={14} strokeWidth={2.5} />
           : state === "skipped" ? <Minus size={14} strokeWidth={2.5} />
           : state === "blocked" ? <X    size={14} strokeWidth={2.5} />
           : <span>{index + 1}</span>}
        </button>

        {/* Task label + state badge */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
          <div style={{
            fontSize: 13.5, lineHeight: 1.7,
            color: cfg?.textColor ?? "var(--c-text-dim)",
            textDecoration: state === "done" ? "line-through" : "none",
            transition: "color 0.15s",
          }}>
            {task}
          </div>
          {cfg?.label && (
            <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: cfg.color, letterSpacing: 1, marginTop: 1 }}>
              {cfg.label}
            </div>
          )}
          {isEdited && (
            <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: accentColor + "99", letterSpacing: 0.5, marginTop: 1 }}>
              EDITED
            </div>
          )}
        </div>

        {/* Edit task text */}
        <button
          type="button"
          className="touch-target"
          onClick={() => onEditTask(index)}
          aria-label="Edit task text"
          style={{
            background: isEdited ? `${accentColor}22` : "none",
            border: `1px solid ${isEdited ? accentColor + "55" : "var(--c-border)"}`,
            borderRadius: 6, padding: "5px 7px",
            color: isEdited ? accentColor : "#5a7a5a",
            cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 28, minWidth: 28,
            transition: "background 0.15s, color 0.15s",
          }}>
          <Pencil size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
