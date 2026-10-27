// Small garden pieces for the month grid: a sprout for a day that has a
// record, and a bed of soil and grass along the foot of the calendar.
//
// The sprout grows with what the day holds. One thing written down (a log, an
// entry, plant notes or a photo) is a pair of seed leaves; two puts a true
// leaf between them; three or more is a small leafy plant. A month you kept
// up with fills in like a bed coming up.

const LEAF_DARK = "#3f7d31";
const LEAF = "#6fb64c";
const LEAF_LIGHT = "#a6dd7a";
const SOIL_TOP = "#3a281a";
const SOIL_DEEP = "#1d140d";
const GRASS = "#6fb64c";

const MAX_GROWTH = 3;

function Leaf({ x, y, angle, len, fill }) {
  const w = len * 0.45;
  return (
    <path
      transform={`translate(${x} ${y}) rotate(${angle})`}
      d={`M0,0 C${len * 0.3},${-w} ${len * 0.75},${-w * 0.8} ${len},0 C${len * 0.75},${w * 0.8} ${len * 0.3},${w} 0,0 Z`}
      fill={fill}
    />
  );
}

/** A sprout for a recorded day. `growth` is how many kinds of record it holds. */
export function DaySprout({ growth = 1, size = 16, dim = false }) {
  const g = Math.max(1, Math.min(MAX_GROWTH, growth));
  const top = g === 1 ? 11 : g === 2 ? 8 : 5;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false" style={{ display: "block", opacity: dim ? 0.7 : 1 }}>
      <path d="M4,19.2 Q10,17.4 16,19.2" stroke={SOIL_TOP} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d={`M10,18.5 C9.6,${(18.5 + top) / 2} 10.4,${(18.5 + top) / 2} 10,${top}`} stroke={LEAF_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {g >= 3 && (
        <>
          <Leaf x={10} y={14} angle={-160} len={5.5} fill={LEAF_DARK} />
          <Leaf x={10} y={14} angle={-20} len={5.5} fill={LEAF_DARK} />
        </>
      )}
      <Leaf x={10} y={top + 1} angle={-150} len={g === 1 ? 6 : 7} fill={LEAF_LIGHT} />
      <Leaf x={10} y={top + 1} angle={-30} len={g === 1 ? 6 : 7} fill={LEAF} />
      {g >= 2 && <Leaf x={10} y={top + 0.5} angle={-90} len={g >= 3 ? 4.5 : 3.6} fill={LEAF_LIGHT} />}
    </svg>
  );
}

const BLADES = [3, 7, 12, 16, 22, 27, 31, 38, 43, 48, 53, 59, 64, 69, 74, 80, 85, 90, 95, 98];
const SPROUTS = [18, 50, 77];

/** A strip of soil with grass and a few sprouts in it, under the month grid. */
export function GardenBed({ height = 22 }) {
  return (
    <svg
      viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false"
      style={{ display: "block", width: "100%", height, margin: "4px 0 0" }}>
      <defs>
        <linearGradient id="garden-bed-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SOIL_TOP} />
          <stop offset="1" stopColor={SOIL_DEEP} />
        </linearGradient>
      </defs>
      <path d="M0,7 Q12,5.8 25,6.6 T50,6.4 T75,6.7 T100,6.2 L100,10 L0,10 Z" fill="url(#garden-bed-soil)" />
      {BLADES.map((x, i) => (
        <path
          key={x}
          d={`M${x - 0.6},7 Q${x + (i % 2 ? 0.9 : -0.9)},${3.8 + (i % 3) * 0.5} ${x + (i % 2 ? 1.2 : -1.2)},${1.6 + (i % 4) * 0.7} Q${x + 0.1},${4.6 + (i % 2)} ${x + 0.6},7 Z`}
          fill={GRASS} opacity={0.32 + (i % 3) * 0.1}
        />
      ))}
      {SPROUTS.map((x) => (
        <g key={x}>
          <path d={`M${x},6.8 L${x},3.6`} stroke={LEAF_DARK} strokeWidth="0.35" />
          <ellipse cx={x - 1} cy={3.4} rx={1.1} ry={0.55} fill={LEAF_LIGHT} transform={`rotate(-20 ${x - 1} 3.4)`} />
          <ellipse cx={x + 1} cy={3.4} rx={1.1} ry={0.55} fill={LEAF} transform={`rotate(20 ${x + 1} 3.4)`} />
        </g>
      ))}
    </svg>
  );
}
