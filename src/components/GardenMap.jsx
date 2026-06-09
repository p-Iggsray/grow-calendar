import { useRef, useState } from "react";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { getPhase, PHASES } from "../lib/growData.js";
import { usePlan } from "../lib/usePlan.jsx";
import { growStrains, distinctStrains, strainShortLabel } from "../lib/growProfile.js";

// SVG coordinate space
const VW = 400;
const VH = 420;
// Yard rectangle inside SVG
const YARD = { x: 52, y: 52, w: 296, h: 248 };
const POT_R = 22;

// Pot positions are saved per grow so different grows keep their own layout.
function storageKey(growId) {
  return `grow-garden-map-${growId || "default"}-v2`;
}

function loadSaved(growId) {
  try { return JSON.parse(localStorage.getItem(storageKey(growId)) ?? "{}"); }
  catch { return {}; }
}

function savePots(growId, pots) {
  const out = {};
  pots.forEach(p => { out[p.id] = { cx: p.cx, cy: p.cy }; });
  localStorage.setItem(storageKey(growId), JSON.stringify(out));
}

// Evenly arrange n pots in a loose grid inside the yard (normalized 0..1).
function defaultPos(i, n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const col = i % cols;
  const row = Math.floor(i / cols);
  return clamp((col + 0.5) / cols, (row + 0.5) / rows);
}

// Build one pot per plant from the grow's strain list. Labels mirror the old
// "SH 1 / SH 2" style: a short code per strain, numbered when a strain repeats.
function buildPots(strainNames, saved) {
  const totalByName = {};
  strainNames.forEach(nm => { totalByName[nm] = (totalByName[nm] ?? 0) + 1; });
  const seen = {};
  const n = strainNames.length;
  return strainNames.map((name, i) => {
    seen[name] = (seen[name] ?? 0) + 1;
    const base = strainShortLabel(name);
    const short = totalByName[name] > 1 ? `${base} ${seen[name]}` : base;
    const id = `pot${i}`;
    const def = defaultPos(i, n);
    return {
      id, short, strain: name,
      cx: saved[id]?.cx ?? def.cx,
      cy: saved[id]?.cy ?? def.cy,
    };
  });
}

// Normalize yard-relative coords to [0,1], clamped so pot stays inside
function clamp(cx, cy) {
  const padX = POT_R / YARD.w;
  const padY = POT_R / YARD.h;
  return {
    cx: Math.max(padX, Math.min(1 - padX, cx)),
    cy: Math.max(padY, Math.min(1 - padY, cy)),
  };
}

// Pot center in SVG coords from normalized [0,1]
function toSVG(cx, cy) {
  return { x: YARD.x + cx * YARD.w, y: YARD.y + cy * YARD.h };
}

// Sun path: quadratic bezier E→S→W (Ohio 39°N — sun paths through south sky)
const SUN_E  = { x: YARD.x + YARD.w + 18, y: YARD.y + YARD.h * 0.55 };
const SUN_W  = { x: YARD.x - 18,          y: YARD.y + YARD.h * 0.55 };
const SUN_CP = { x: YARD.x + YARD.w * 0.5, y: YARD.y + YARD.h + 72 };

// Point on quadratic bezier at t ∈ [0,1]
function bezier(t, p0, cp, p1) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
  };
}

// Approximate sun position: sunrise ~6h, sunset ~20h in Ohio summer
function sunT(hour) {
  const t = (hour - 6) / 14;
  return Math.max(0, Math.min(1, t));
}

export default function GardenMap({ today, config, onClose }) {
  const { survey, generatedPlan, activeGrowId } = usePlan();
  const plantNames = growStrains(survey, generatedPlan);
  const svgRef = useRef(null);
  const [pots, setPots] = useState(() => buildPots(plantNames, loadSaved(activeGrowId)));
  const [dragging, setDragging] = useState(null); // { id, offsetCx, offsetCy }
  const [selected, setSelected] = useState(null);

  const phase = config ? getPhase(today, config) : null;
  const phaseColor = (phase && PHASES[phase]?.color) ?? "var(--c-accent)";

  function clientToNorm(clientX, clientY) {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const scale = r.width / VW;
    const svgX = (clientX - r.left) / scale;
    const svgY = (clientY - r.top)  / scale;
    return {
      cx: (svgX - YARD.x) / YARD.w,
      cy: (svgY - YARD.y) / YARD.h,
    };
  }

  function onPotPointerDown(e, id) {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const pot = pots.find(p => p.id === id);
    if (!pot) return;
    const norm = clientToNorm(e.clientX, e.clientY);
    if (!norm) return;
    setDragging({ id, offsetCx: norm.cx - pot.cx, offsetCy: norm.cy - pot.cy });
    setSelected(id);
  }

  function onSVGPointerMove(e) {
    if (!dragging) return;
    const norm = clientToNorm(e.clientX, e.clientY);
    if (!norm) return;
    const raw = { cx: norm.cx - dragging.offsetCx, cy: norm.cy - dragging.offsetCy };
    const clamped = clamp(raw.cx, raw.cy);
    setPots(prev => prev.map(p => p.id === dragging.id ? { ...p, ...clamped } : p));
  }

  function onSVGPointerUp(e) {
    if (!dragging) return;
    svgRef.current?.releasePointerCapture(e.pointerId);
    savePots(activeGrowId, pots);
    setDragging(null);
  }

  function resetPositions() {
    localStorage.removeItem(storageKey(activeGrowId));
    setPots(buildPots(plantNames, {}));
    setSelected(null);
  }

  const hour = today.getHours();
  const isDaytime = hour >= 6 && hour < 20;
  const sunPos = isDaytime ? bezier(sunT(hour), SUN_E, SUN_CP, SUN_W) : null;

  const sunPathD = `M ${SUN_E.x},${SUN_E.y} Q ${SUN_CP.x},${SUN_CP.y} ${SUN_W.x},${SUN_W.y}`;

  const selPot = pots.find(p => p.id === selected);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "var(--c-bg)",
      display: "flex", flexDirection: "column",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px",
        borderBottom: "1px solid var(--c-surface-2)",
        background: "var(--c-header-bg)",
        flexShrink: 0,
      }}>
        <button type="button" onClick={onClose} style={{
          background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, padding: "10px 14px", color: "#c0d4c0",
          cursor: "pointer", minHeight: 44,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#6aaa6a", textTransform: "uppercase" }}>Garden</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Yard Map</div>
        </div>
        <button type="button" className="touch-target" onClick={resetPositions} style={{
          background: "none", border: "none", color: "#6aaa6a",
          cursor: "pointer", padding: 8, display: "flex", alignItems: "center", gap: 5,
          fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1,
        }}>
          <RotateCcw size={13} strokeWidth={2} />
          Reset
        </button>
      </div>

      {/* SVG map */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "16px 14px 8px" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", flex: 1, touchAction: "none", cursor: dragging ? "grabbing" : "default" }}
          onPointerMove={onSVGPointerMove}
          onPointerUp={onSVGPointerUp}
          onPointerCancel={onSVGPointerUp}
        >
          {/* Yard fill */}
          <rect
            x={YARD.x} y={YARD.y} width={YARD.w} height={YARD.h}
            rx={14}
            fill="rgba(34,100,34,0.09)"
            stroke="var(--c-border)"
            strokeWidth={1.5}
          />

          {/* Grass texture lines */}
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1={YARD.x + (i + 1) * YARD.w / 9}
              y1={YARD.y + 10}
              x2={YARD.x + (i + 1) * YARD.w / 9}
              y2={YARD.y + YARD.h - 10}
              stroke="rgba(34,100,34,0.07)"
              strokeWidth={1}
            />
          ))}

          {/* Sun path arc */}
          <path
            d={sunPathD}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            opacity={0.5}
          />

          {/* Compass labels */}
          <text x={VW / 2} y={34} textAnchor="middle" fill="var(--c-text-ghost)" fontSize={11} fontFamily="'Courier New', monospace" letterSpacing={2}>N</text>
          <text x={VW / 2} y={VH - 8} textAnchor="middle" fill="#f59e0b" fontSize={11} fontFamily="'Courier New', monospace" letterSpacing={2} opacity={0.7}>S ☀</text>
          <text x={14} y={YARD.y + YARD.h / 2 + 4} textAnchor="middle" fill="#f59e0b" fontSize={11} fontFamily="'Courier New', monospace" opacity={0.7}>W</text>
          <text x={VW - 14} y={YARD.y + YARD.h / 2 + 4} textAnchor="middle" fill="#f59e0b" fontSize={11} fontFamily="'Courier New', monospace" opacity={0.7}>E</text>

          {/* Live sun marker */}
          {sunPos && (
            <g>
              <circle cx={sunPos.x} cy={sunPos.y} r={9} fill="#fbbf24" opacity={0.85} />
              <circle cx={sunPos.x} cy={sunPos.y} r={13} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.35} />
              <text x={sunPos.x} y={sunPos.y + 4} textAnchor="middle" fontSize={10}>☀</text>
            </g>
          )}

          {/* Pots */}
          {pots.map(pot => {
            const { x, y } = toSVG(pot.cx, pot.cy);
            const isSel = selected === pot.id;
            const isDraggingThis = dragging?.id === pot.id;
            return (
              <g
                key={pot.id}
                style={{ cursor: isDraggingThis ? "grabbing" : "grab" }}
                onPointerDown={e => onPotPointerDown(e, pot.id)}
              >
                {/* Selection halo */}
                {isSel && (
                  <circle cx={x} cy={y} r={POT_R + 7} fill="none" stroke={phaseColor} strokeWidth={1.5} opacity={0.4} />
                )}
                {/* Pot circle */}
                <circle
                  cx={x} cy={y} r={POT_R}
                  fill={`${phaseColor}28`}
                  stroke={phaseColor}
                  strokeWidth={isSel ? 2.5 : 1.8}
                />
                {/* Pot label */}
                <text
                  x={x} y={y - 3}
                  textAnchor="middle"
                  fill="var(--c-text)"
                  fontSize={9}
                  fontFamily="'Courier New', monospace"
                  fontWeight={700}
                  letterSpacing={0.5}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {pot.short}
                </text>
                {/* Drag handle dot */}
                <circle cx={x} cy={y + 8} r={2.5} fill={phaseColor} opacity={0.6} style={{ pointerEvents: "none" }} />
              </g>
            );
          })}
        </svg>

        {/* Selected pot info */}
        <div style={{ minHeight: 52, display: "flex", alignItems: "center", padding: "0 4px" }}>
          {selPot ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
              borderRadius: 10, padding: "10px 14px", width: "100%",
            }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: phaseColor, flexShrink: 0 }} />
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "var(--c-text-dim)" }}>
                <span style={{ fontWeight: 700, color: "var(--c-text)" }}>{selPot.strain}</span>
                {phase && <span style={{ color: "var(--c-text-faint)", marginLeft: 8 }}>· {PHASES[phase]?.label ?? phase} phase</span>}
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 1 }}>
              Tap a pot to select · drag to reposition
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        borderTop: "1px solid var(--c-border-faint)",
        padding: "10px 18px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        display: "flex", gap: 20, flexWrap: "wrap",
      }}>
        {distinctStrains(survey, generatedPlan).map(name => {
          const count = plantNames.filter(p => p === name).length;
          const base = strainShortLabel(name);
          const label = count > 1 ? `${base} 1-${count}` : base;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: phaseColor, border: `1.5px solid ${phaseColor}` }} />
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "var(--c-text-faint)", letterSpacing: 0.5 }}>
                <span style={{ color: "var(--c-text-dim)", fontWeight: 700 }}>{label}</span> · {name}
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width={18} height={8}>
            <line x1={0} y1={4} x2={18} y2={4} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" />
          </svg>
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "var(--c-text-faint)", letterSpacing: 0.5 }}>Sun path E→S→W</span>
        </div>
      </div>
    </div>
  );
}
