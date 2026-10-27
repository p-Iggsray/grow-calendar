import { cropOfStage, stagesFor } from "../lib/crops.js";

// The space's stage, drawn: a pot that grows a plant, or a jar and tub that
// grow mushrooms. It is the home screen saying "garden" before it says
// anything else, and it changes as the grow does, so it is never decoration
// for its own sake.
//
// Drawn in a 100-unit box with the brand's colours: terracotta, soil, the
// seedling's greens from the logo, cream and gold for buds and caps.

const LEAF_DARK = "#3f7d31";
const LEAF = "#6fb64c";
const LEAF_LIGHT = "#a6dd7a";
const SOIL_TOP = "#4d3523";
const POT = "#c4683c";
const POT_RIM = "#d9794a";
const CREAM = "#f1e7d6";
const GOLD = "#d39a3a";
const GLASS = "rgba(241,231,214,0.16)";
const GRAIN = "#8a6a3e";
const MYCELIUM = "#f4efe6";
const WATER = "#5ab4e8";
const BUD = "#9fd07a";
const BUD_DARK = "#6fb64c";
const BUD_LIGHT = "#c3e6a3";
const PISTIL = "#ff8a4c";
const LAST_GROWING_STEP = 5;

function Pot() {
  return (
    <>
      <path d="M30,70 L70,70 L66,94 Q66,97 63,97 L37,97 Q34,97 34,94 Z" fill={POT} />
      <rect x="26" y="65" width="48" height="9" rx="2.5" fill={POT_RIM} />
      <ellipse cx="50" cy="66" rx="21" ry="3" fill={SOIL_TOP} />
    </>
  );
}

// A leaf from (x, y) pointing at `angle` degrees, `len` long.
function Leaf({ x, y, angle, len, fill = LEAF }) {
  const w = len * 0.42;
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${angle})`}
      d={`M0,0 C${len * 0.3},${-w} ${len * 0.75},${-w * 0.8} ${len},0 C${len * 0.75},${w * 0.8} ${len * 0.3},${w} 0,0 Z`}
      fill={fill}
    />
  );
}

function Stem({ top }) {
  return <path d={`M50,66 C49,${(66 + top) / 2} 51,${(66 + top) / 2} 50,${top}`} stroke={LEAF_DARK} strokeWidth="3" fill="none" strokeLinecap="round" />;
}

// A cola: a tapering stack of calyxes, frosted, with orange pistils.
function Bud({ x, y, r = 4.5 }) {
  return (
    <g>
      <ellipse cx={x} cy={y + r * 0.9} rx={r} ry={r * 0.9} fill={BUD_DARK} />
      <ellipse cx={x} cy={y} rx={r * 0.85} ry={r * 0.95} fill={BUD} />
      <ellipse cx={x} cy={y - r * 0.95} rx={r * 0.6} ry={r * 0.75} fill={BUD_LIGHT} />
      <circle cx={x - r * 0.35} cy={y - r * 0.2} r={r * 0.22} fill={CREAM} opacity="0.9" />
      <circle cx={x + r * 0.4} cy={y + r * 0.5} r={r * 0.2} fill={CREAM} opacity="0.8" />
      <path d={`M${x - r * 0.2},${y - r * 1.2} l${-r * 0.5},${-r * 0.6} M${x + r * 0.3},${y - r * 0.6} l${r * 0.7},${-r * 0.4} M${x - r * 0.5},${y + r * 0.3} l${-r * 0.7},${-r * 0.1}`}
        stroke={PISTIL} strokeWidth="0.9" strokeLinecap="round" />
    </g>
  );
}

function CannabisPlant({ step }) {
  if (step === 0) {
    // A seed on the soil, cracked, its first shoot coming up.
    return (
      <>
        <Pot />
        <ellipse cx="50" cy="61" rx="5" ry="3.6" fill="#7a5532" />
        <path d="M51,58 C53,54 56,53 58,54" stroke={LEAF_LIGHT} strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        <Pot />
        <Stem top={48} />
        <Leaf x={50} y={49} angle={-155} len={15} fill={LEAF_LIGHT} />
        <Leaf x={50} y={49} angle={-25} len={15} fill={LEAF} />
      </>
    );
  }
  const tall = step >= 3;
  const top = tall ? 14 : 26;
  return (
    <>
      <Pot />
      <Stem top={top} />
      <Leaf x={50} y={56} angle={-160} len={14} fill={LEAF_DARK} />
      <Leaf x={50} y={56} angle={-20} len={14} fill={LEAF_DARK} />
      <Leaf x={50} y={44} angle={-150} len={18} />
      <Leaf x={50} y={44} angle={-30} len={18} />
      <Leaf x={50} y={33} angle={-140} len={tall ? 16 : 13} fill={LEAF_LIGHT} />
      <Leaf x={50} y={33} angle={-40} len={tall ? 16 : 13} fill={LEAF_LIGHT} />
      {!tall && <Leaf x={50} y={27} angle={-90} len={9} fill={LEAF_LIGHT} />}
      {tall && (
        <>
          <Leaf x={50} y={24} angle={-130} len={11} fill={LEAF} />
          <Leaf x={50} y={24} angle={-50} len={11} fill={LEAF} />
          <Bud x={50} y={12} r={6} />
          <Bud x={38} y={28} />
          <Bud x={62} y={28} />
          <Bud x={33} y={40} r={3.6} />
          <Bud x={67} y={40} r={3.6} />
        </>
      )}
      {step === 4 && <path d="M78,46 C74,52 74,56 78,57 C82,56 82,52 78,46 Z" fill={WATER} />}
      {step === 5 && (
        <g transform="translate(73 44) rotate(-30)" stroke={CREAM} strokeWidth="1.8" fill="none">
          <circle cx="0" cy="8" r="3" /><circle cx="7" cy="8" r="3" />
          <path d="M1.5,5.5 L9,-6 M5.5,5.5 L-2,-6" strokeLinecap="round" />
        </g>
      )}
    </>
  );
}

function Jar({ fill, white = 0 }) {
  return (
    <>
      <rect x="32" y="28" width="36" height="66" rx="7" fill={GLASS} stroke={CREAM} strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="30" y="22" width="40" height="9" rx="2.5" fill={GOLD} />
      <rect x="35" y={94 - fill} width="30" height={fill - 3} rx="4" fill={GRAIN} />
      {white > 0 && <rect x="35" y={94 - fill} width="30" height={(fill - 3) * white} rx="4" fill={MYCELIUM} opacity="0.92" />}
      {[44, 52, 60, 48, 56].map((x, i) => (
        <circle key={i} cx={x} cy={94 - fill * (0.25 + (i % 3) * 0.25)} r="1.6" fill="#b08a55" opacity={white >= 1 ? 0 : 0.8} />
      ))}
    </>
  );
}

function Tub({ white }) {
  return (
    <>
      <path d="M16,56 L84,56 L80,94 Q80,97 77,97 L23,97 Q20,97 20,94 Z" fill={GLASS} stroke={CREAM} strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="20" y="66" width="60" height="28" rx="3" fill={GRAIN} />
      <rect x="20" y="66" width="60" height={white ? 9 : 4} rx="3" fill={MYCELIUM} opacity={white ? 0.95 : 0.5} />
    </>
  );
}

function Mushroom({ x, y, h, cap }) {
  return (
    <g>
      <path d={`M${x - 2.5},${y} L${x - 2},${y - h} L${x + 2},${y - h} L${x + 2.5},${y} Z`} fill={CREAM} />
      <path d={`M${x - cap},${y - h + 1} C${x - cap},${y - h - cap * 0.9} ${x + cap},${y - h - cap * 0.9} ${x + cap},${y - h + 1} Z`} fill={GOLD} />
      <path d={`M${x - cap * 0.6},${y - h - cap * 0.25} C${x - cap * 0.3},${y - h - cap * 0.6} ${x},${y - h - cap * 0.62} ${x + cap * 0.2},${y - h - cap * 0.55}`} stroke="#e8b45c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  );
}

function MushroomScene({ step }) {
  if (step === 0) return <Jar fill={40} />;
  if (step === 1) return <Jar fill={40} white={0.6} />;
  if (step === 2) return <Tub white={false} />;
  if (step === 3) return <Tub white />;
  const big = step >= 5;
  return (
    <>
      <Tub white />
      <Mushroom x={36} y={67} h={big ? 20 : 12} cap={big ? 10 : 7} />
      <Mushroom x={52} y={67} h={big ? 28 : 17} cap={big ? 12 : 8} />
      <Mushroom x={67} y={67} h={big ? 17 : 10} cap={big ? 9 : 6} />
    </>
  );
}

/** The current stage as a little growing scene. `stage` is a stage value. */
export default function StagePlant({ stage, size = 64 }) {
  if (!stage) return null;
  const crop = cropOfStage(stage);
  // Everything past the harvest (drying, curing, stored) keeps the harvest scene.
  const step = Math.min(LAST_GROWING_STEP, Math.max(0, stagesFor(crop).indexOf(stage)));
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false" style={{ flexShrink: 0, overflow: "visible" }}>
      {crop === "mushrooms" ? <MushroomScene step={step} /> : <CannabisPlant step={step} />}
    </svg>
  );
}
