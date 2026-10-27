// The Black Cat Growz mark: the grin in the dark, with a seedling clenched in
// the corner of its mouth. Two eyes, a crescent of teeth, and a sprout whose
// stem disappears behind the grin.
//
// The geometry lives here, on its own, because every place the brand appears
// draws it: React in the app, an SVG string in the splash paint, the public
// strain page and the rundown, a canvas on both jar labels, and the app icon.
// They must be the same cat, so they read the same numbers, and each one asks
// for the mark as a list of drawing steps (markSteps) rather than redrawing it.
//
// The eyes and grin are traced from the brand artwork, in its own pixel space:
// the face is 2400 wide and its centre line is x = 1012. The right eye is the
// left eye mirrored about that line; the glints are not, because the light
// comes from one side.

const MIRROR_AXIS_X2 = 2024;
const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
  (_, x, y) => `${MIRROR_AXIS_X2 - Number(x)},${y}`);

export const BRAND = {
  ground: "#100d0b",
  gold: "#d39a3a",
  lid: "#8a5a1e",
  cream: "#f1e7d6",
  ink: "#13100d",
  pupil: "#060505",
  aura: "#6b4f8c",
  leaf: "#7cc257",
  leafLight: "#9fd77a",
  leafVein: "#3f7d31",
  leafTip: "#5fa548",
  mouthShadow: "#0d1a08",
};

export const EYE_LID_L = "M288,450 Q318,410 377,388 L412,368 Q578,379 845,446 L870,475 L930,562 Q865,620 795,648 L752,667 Q621,659 418,607 L387,579 Q330,525 288,450 Z";
export const EYE_L = "M288,450 Q318,410 377,388 Q582,389 870,475 L930,562 Q865,620 795,648 Q615,637 387,579 Q330,525 288,450 Z";
export const PUPIL_L = "M602,412 Q548,505 575,623 L602,627 Q668,515 649,421 Z";
export const EYE_LID_R = mirror(EYE_LID_L);
export const EYE_R = mirror(EYE_L);
export const PUPIL_R = mirror(PUPIL_L);
export const GLINTS = [{ cx: 692, cy: 490, r: 27 }, { cx: 1488, cy: 462, r: 27 }];

// The grin is a crescent; the teeth are one zigzag line drawn across it.
export const GRIN = "M210,856 C520,1035 1504,1035 1820,856 C1324,1313 700,1313 210,856 Z";
export const TEETH = "M263,886 L370,971 L482,955 L582,1080 L688,1008 L795,1142 L901,1030 L1007,1167 L1113,1030 L1220,1142 L1326,1008 L1432,1080 L1534,955 L1646,971 L1753,886";

// The seedling. Its stem starts inside the mouth and is drawn BEFORE the grin,
// so the teeth cover it and it only shows from the corner of the mouth out.
// The shadow is the stem going dark as it enters the lips.
export const STEM = "M1660,940 C1730,920 1790,893 1840,862 C1925,810 1985,770 2008,700";
export const STEM_LIGHT = "M1872,836 C1932,800 1978,762 1996,706";
export const MOUTH_SHADOW = "M1800,885 C1830,868 1852,854 1872,840";
// Two seed leaves, and the first true leaf coming up between them.
export const LEAF_L = "M2010,700 C1960,598 1830,548 1742,585 C1795,676 1918,722 2010,700 Z";
export const LEAF_R = "M2010,700 C2045,585 2165,512 2268,525 C2247,635 2130,714 2010,700 Z";
export const LEAF_TIP = "M2010,700 C1992,650 2000,610 2030,585 C2048,622 2040,668 2010,700 Z";
export const VEINS = [
  "M2010,700 C1940,656 1845,616 1772,592",
  "M2010,700 C2075,648 2160,580 2245,535",
];

// A tight box around the eyes, the grin and the leaves.
export const VIEWBOX = [180, 330, 2130, 900];

// Gradients in the mark's own coordinates, so SVG and canvas paint them the
// same way.
const GRADIENTS = {
  stem: { from: [1660, 940], to: [2008, 700], stops: [[0, "#3f7d31"], [1, "#5fa548"]] },
  leafL: { from: [2010, 722], to: [1742, 548], stops: [[0, "#4f9a3c"], [0.65, "#86c95f"], [1, "#b9e88c"]] },
  leafR: { from: [2010, 714], to: [2268, 512], stops: [[0, "#4a9338"], [0.6, "#7cc257"], [1, "#aee07f"]] },
};

const STROKE_TEETH = 32;
const STROKE_STEM = 34;
const STROKE_STEM_LIGHT = 9;
const STROKE_VEIN = 9;
const STROKE_MOUTH_SHADOW = 40;
const BLUR_MOUTH_SHADOW = 9;
const BLUR_LEAF_GLOW = 22;
const BLUR_AURA = 38;

/**
 * The mark as drawing steps, in paint order. Every renderer walks this list.
 *
 * `tone` is "color" (the artwork), "mono" (one black ink on white paper, the
 * thermal label) or "monoInverse" (white on a black bar). One ink cannot show
 * gold eyes on cream teeth, so mono fills the eyes, grin and leaves solid and
 * cuts the pupils, teeth and leaf veins out of them. `glow` puts the purple
 * aura of the artwork behind the face, in colour only.
 */
export function markSteps({ tone = "color", glow = false } = {}) {
  if (tone !== "color") {
    const ink = tone === "mono" ? "#000" : "#fff";
    const cut = tone === "mono" ? "#fff" : "#000";
    return [
      { d: EYE_LID_L, fill: ink }, { d: EYE_LID_R, fill: ink },
      { d: PUPIL_L, fill: cut }, { d: PUPIL_R, fill: cut },
      { d: STEM, stroke: ink, width: STROKE_STEM, cap: "round" },
      { d: GRIN, fill: ink },
      { d: TEETH, stroke: cut, width: STROKE_TEETH },
      { d: LEAF_TIP, fill: ink }, { d: LEAF_L, fill: ink }, { d: LEAF_R, fill: ink },
      ...VEINS.map((d) => ({ d, stroke: cut, width: STROKE_VEIN, cap: "round" })),
    ];
  }
  const b = BRAND;
  return [
    ...(glow ? [{ group: [EYE_L, EYE_R, GRIN], fill: b.aura, blur: BLUR_AURA, opacity: 0.75 }] : []),
    { d: EYE_LID_L, fill: b.lid }, { d: EYE_L, fill: b.gold }, { d: PUPIL_L, fill: b.pupil },
    { d: EYE_LID_R, fill: b.lid }, { d: EYE_R, fill: b.gold }, { d: PUPIL_R, fill: b.pupil },
    ...GLINTS.map((g) => ({ circle: g, fill: b.cream })),
    { d: STEM, stroke: { gradient: "stem" }, width: STROKE_STEM, cap: "round" },
    { d: STEM_LIGHT, stroke: b.leafLight, width: STROKE_STEM_LIGHT, cap: "round", opacity: 0.7 },
    { d: MOUTH_SHADOW, stroke: b.mouthShadow, width: STROKE_MOUTH_SHADOW, cap: "round", blur: BLUR_MOUTH_SHADOW, opacity: 0.75 },
    { d: GRIN, fill: b.cream },
    { d: TEETH, stroke: b.ink, width: STROKE_TEETH },
    { group: [LEAF_L, LEAF_R], fill: b.leaf, blur: BLUR_LEAF_GLOW, opacity: 0.35 },
    { d: LEAF_TIP, fill: b.leafTip },
    { d: LEAF_L, fill: { gradient: "leafL" } },
    { d: LEAF_R, fill: { gradient: "leafR" } },
    ...VEINS.map((d) => ({ d, stroke: b.leafVein, width: STROKE_VEIN, cap: "round", opacity: 0.6 })),
  ];
}

/** The box the mark is drawn in. */
export function markBox() {
  return VIEWBOX;
}

/** Height over width. */
export function markAspect() {
  return VIEWBOX[3] / VIEWBOX[2];
}

function svgPaint(paint, id) {
  return typeof paint === "object" ? `url(#${id(paint.gradient)})` : paint;
}

function svgDefs(steps, id) {
  const used = new Set();
  const blurs = new Set();
  for (const s of steps) {
    for (const p of [s.fill, s.stroke]) if (p && typeof p === "object") used.add(p.gradient);
    if (s.blur) blurs.add(s.blur);
  }
  if (!used.size && !blurs.size) return "";
  const grads = [...used].map((name) => {
    const g = GRADIENTS[name];
    return `<linearGradient id="${id(name)}" gradientUnits="userSpaceOnUse" x1="${g.from[0]}" y1="${g.from[1]}" x2="${g.to[0]}" y2="${g.to[1]}">` +
      g.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("") + `</linearGradient>`;
  }).join("");
  const filters = [...blurs].map((n) =>
    `<filter id="${id(`blur${n}`)}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n}"/></filter>`,
  ).join("");
  return `<defs>${grads}${filters}</defs>`;
}

/**
 * The mark as an SVG string. `uid` scopes the gradient and filter ids, so two
 * marks on one page cannot take each other's paint.
 */
export function catMarkSvg({ width = 120, tone = "color", glow = false, uid = "bcb", title = "" } = {}) {
  const id = (name) => `${uid}-${name}`;
  const steps = markSteps({ tone, glow });
  const body = steps.map((s) => {
    const opacity = s.opacity !== undefined ? ` opacity="${s.opacity}"` : "";
    const filter = s.blur ? ` filter="url(#${id(`blur${s.blur}`)})"` : "";
    if (s.group) {
      return `<g${filter}${opacity}>${s.group.map((d) => `<path d="${d}" fill="${s.fill}"/>`).join("")}</g>`;
    }
    if (s.circle) {
      return `<circle cx="${s.circle.cx}" cy="${s.circle.cy}" r="${s.circle.r}" fill="${svgPaint(s.fill, id)}"${opacity}/>`;
    }
    const fill = s.fill ? svgPaint(s.fill, id) : "none";
    const stroke = s.stroke
      ? ` stroke="${svgPaint(s.stroke, id)}" stroke-width="${s.width}"${s.cap ? ` stroke-linecap="${s.cap}"` : ""}`
      : "";
    return `<path d="${s.d}" fill="${fill}"${stroke}${filter}${opacity}/>`;
  }).join("");
  const height = Math.round(width * markAspect());
  const label = title
    ? ` role="img" aria-label="${title.replace(/"/g, "&quot;")}"`
    : ` aria-hidden="true" focusable="false"`;
  return `<svg viewBox="${VIEWBOX.join(" ")}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"${label}>` +
    `${svgDefs(steps, id)}${body}</svg>`;
}

/**
 * The mark on a canvas, with its top-left at `x`, `y` and `w` wide. Blur uses
 * the canvas filter where there is one; an engine without it (older iOS)
 * draws the same shape unblurred, which is softer than nothing.
 */
export function drawCatMark(ctx, x, y, w, { tone = "color", glow = false } = {}) {
  const [bx, by, bw] = VIEWBOX;
  const s = w / bw;
  const paint = (p) => {
    if (typeof p !== "object") return p;
    const g = GRADIENTS[p.gradient];
    const grad = ctx.createLinearGradient(g.from[0], g.from[1], g.to[0], g.to[1]);
    for (const [o, c] of g.stops) grad.addColorStop(o, c);
    return grad;
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-bx, -by);
  for (const step of markSteps({ tone, glow })) {
    ctx.save();
    if (step.opacity !== undefined) ctx.globalAlpha = step.opacity;
    if (step.blur && "filter" in ctx) ctx.filter = `blur(${step.blur * s}px)`;
    if (step.group) {
      ctx.fillStyle = step.fill;
      for (const d of step.group) ctx.fill(new Path2D(d));
    } else if (step.circle) {
      ctx.beginPath();
      ctx.arc(step.circle.cx, step.circle.cy, step.circle.r, 0, Math.PI * 2);
      ctx.fillStyle = paint(step.fill);
      ctx.fill();
    } else {
      const path = new Path2D(step.d);
      if (step.fill) { ctx.fillStyle = paint(step.fill); ctx.fill(path); }
      if (step.stroke) {
        ctx.strokeStyle = paint(step.stroke);
        ctx.lineWidth = step.width;
        ctx.lineCap = step.cap ?? "butt";
        ctx.lineJoin = "miter";
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
