import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { stageGroup, stageLabel, stagesFor } from "../../lib/stageTimeline.js";
import { cropOf } from "../../lib/crops.js";

export const UI = "var(--font-ui)";
export const BOOK = "var(--font-journal)";
export const NUM = "var(--font-num)";

export function keyOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function StageDot({ stage, color: given, size = 8 }) {
  const color = given ?? stageGroup(stage)?.color;
  if (!color) return null;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: size, background: color, flexShrink: 0,
    }} />
  );
}

export function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: 1.6,
      textTransform: "uppercase", color: "var(--c-text-ghost)", ...style,
    }}>
      {children}
    </div>
  );
}

// The masthead rule from the grower's own journal page, in two weights.
export function Rule({ style }) {
  return (
    <div aria-hidden="true" style={style}>
      <div style={{ height: 2, background: "var(--c-border-strong)" }} />
      <div style={{ height: 1, background: "var(--c-border-faint)", marginTop: 2 }} />
    </div>
  );
}

// Which space you are reading. A link with one space shows its name and no
// control, because a menu of one is furniture.
export function SpaceSwitcher({ spaces, spaceId, onPick }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const current = spaces.find((s) => s.id === spaceId) ?? spaces[0];

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (spaces.length < 2) {
    return (
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, color: "var(--c-text)" }}>
        {current?.name}
      </div>
    );
  }

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "flex", alignItems: "center", gap: 7, padding: 0,
          background: "none", border: "none", cursor: "pointer",
          fontSize: 22, fontWeight: 900, letterSpacing: -0.5,
          color: "var(--c-text)", textAlign: "left", fontFamily: UI,
        }}>
        {current?.name}
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          aria-hidden="true"
          style={{ color: "var(--c-text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 20,
            minWidth: 230, maxWidth: "min(92vw, 340px)", margin: 0, padding: 5,
            listStyle: "none", background: "var(--c-panel-bg)",
            border: "1px solid var(--c-border-strong)", borderRadius: 12,
            boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
          }}>
          {spaces.map((s) => {
            const picked = s.id === spaceId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked}
                  onClick={() => { setOpen(false); onPick(s.id); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%",
                    padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                    background: picked ? "rgba(var(--c-accent-rgb), 0.12)" : "none",
                    border: "none", textAlign: "left", fontFamily: UI,
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block", fontSize: 14, fontWeight: 700, color: "var(--c-text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {s.name}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--c-text-muted)", marginTop: 1 }}>
                      {[s.survey?.environment, s.status === "active" ? "growing" : s.status].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {picked && <Check size={14} strokeWidth={2.6} aria-hidden="true" style={{ color: "var(--c-accent)", flexShrink: 0 }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// One crop's ladder only: a shared monotub has no use for a Veg swatch.
function swatchesFor(crop) {
  const ladder = stagesFor(crop);
  const seen = new Set();
  const out = [];
  for (const stage of ladder) {
    const group = stageGroup(stage);
    if (!group || seen.has(group.key)) continue;
    seen.add(group.key);
    const members = ladder.filter((s) => stageGroup(s)?.key === group.key);
    out.push({ key: group.key, color: group.color, label: members.map(stageLabel).join(" · ") });
  }
  return out;
}

// A local copy rather than the shared PhaseLegend: this route mounts outside
// PlanProvider, so the app's own component has no context to read.
export function BuddyPhaseLegend({ survey }) {
  const swatches = swatchesFor(cropOf(survey));
  return (
    <details style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 12,
      border: "1px solid var(--c-border-faint)",
    }}>
      <summary className="touch-target" style={{
        listStyle: "none", padding: "10px 14px", cursor: "pointer",
        fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)",
        textTransform: "uppercase", fontFamily: UI,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span aria-hidden="true">›</span> What do the colors mean?
      </summary>
      <div style={{ padding: "4px 14px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
          {swatches.map((v) => (
            <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <StageDot color={v.color} />
              <span style={{ fontSize: 11, color: "var(--c-text-muted)", fontFamily: UI }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function Empty({ children }) {
  return (
    <div style={{
      textAlign: "center", padding: "34px 26px", fontFamily: UI,
      fontSize: 12.5, color: "var(--c-text-muted)", lineHeight: 1.75,
    }}>
      {children}
    </div>
  );
}
