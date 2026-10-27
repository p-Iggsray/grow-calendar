// The Black Cat Budz mark: the grin in the dark. Two eyes, a crescent of teeth,
// a joint in the corner of the mouth and the smoke coming off it.
//
// The geometry lives here, on its own, because every place the brand appears
// draws it: React in the app, an SVG string in the splash paint, the public
// strain page and the rundown, a canvas on both jar labels, and the app icon.
// They must be the same cat, so they read the same numbers, and each one asks
// for the mark as a list of drawing steps (markSteps) rather than redrawing it.
//
// Traced from the brand artwork, in its own pixel space: the face is 2400 wide
// and its centre line is x = 1012. The right eye is the left eye mirrored
// about that line; the glints are not, because the light comes from one side.

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
  ember: "#ff692a",
  filter: "#b98a58",
  twist: "#cbbba2",
  ash: "#8c847c",
  ashDot: "#5a524c",
  smokeTop: "#7d62a8",
  smokeMid: "#b9a0dc",
  smokeLow: "#e6dbf3",
  aura: "#6b4f8c",
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

export const JOINT = "M1676,872 L2134,1010 Q2162,1020 2158,1050 L2132,1146 Q2120,1172 2092,1166 L1648,946 Z";
export const FILTER = "M1676,872 L1764,898 L1742,976 L1648,946 Z";
export const FILTER_EDGE = "M1764,898 L1742,972";
export const TWISTS = ["M1814,1006 L1900,945", "M1884,1040 L1977,964", "M1956,1072 L2052,988"];
export const BAND = "M2094,984 L2039,1137";
export const ASH = "M2101,1000 L2134,1010 Q2162,1020 2158,1050 L2132,1146 Q2120,1172 2092,1166 L2050,1145 Z";
export const ASH_DOT = { cx: 2092, cy: 1089, r: 11 };
export const EMBER = { cx: 2080, cy: 1075, r: 210 };

export const SMOKE = [
  { d: "M220,876 C170,780 150,700 100,650 C60,615 25,575 40,535 C55,500 110,480 160,494 L168,504 C145,500 125,515 118,540 C112,565 125,590 150,615 C190,665 200,760 220,860 Z", opacity: 0.8 },
  { d: "M2096,980 C2080,930 2120,860 2160,780 C2210,690 2200,600 2140,480 C2060,380 1980,300 1990,200 C2000,110 2080,40 2160,30 C2240,24 2300,60 2300,110 C2300,135 2285,160 2270,172 C2280,140 2270,100 2240,100 C2200,104 2140,150 2120,210 C2100,280 2160,380 2220,480 C2260,560 2260,660 2220,760 C2180,860 2120,920 2110,980 Z", opacity: 1 },
  { d: "M2170,1040 C2190,980 2200,880 2210,790 C2220,720 2280,680 2320,640 C2360,600 2370,540 2365,460 C2360,420 2350,400 2370,380 C2375,420 2380,460 2380,520 C2380,600 2330,660 2300,700 C2260,750 2250,800 2240,860 C2230,940 2210,1000 2185,1045 Z", opacity: 0.7 },
];

// The whole mark with its smoke, and the face alone, tight around the eyes,
// grin and joint. Small and one-ink marks use the face: smoke is a wash of
// colour and a thermal printer has no wash to give.
export const VIEWBOX_FULL = [0, 0, 2400, 1290];
export const VIEWBOX_FACE = [190, 340, 1990, 860];

const STROKE_TEETH = 32;
const STROKE_OUTLINE = 16;
const STROKE_TWIST = 13;
const STROKE_BAND = 30;

/**
 * The mark as drawing steps, in paint order. Every renderer walks this list.
 *
 * `tone` is "color" (the artwork), "mono" (one black ink on white paper, the
 * thermal label) or "monoInverse" (white on a black bar). One ink cannot show
 * gold eyes on cream teeth, so mono fills the eyes and the grin solid and cuts
 * the pupils and the teeth out of them. `smoke` and `glow` only apply in colour.
 */
export function markSteps({ tone = "color", smoke = true, glow = false } = {}) {
  if (tone !== "color") {
    const ink = tone === "mono" ? "#000" : "#fff";
    const cut = tone === "mono" ? "#fff" : "#000";
    return [
      { d: EYE_LID_L, fill: ink }, { d: EYE_LID_R, fill: ink },
      { d: PUPIL_L, fill: cut }, { d: PUPIL_R, fill: cut },
      { d: GRIN, fill: ink },
      { d: TEETH, stroke: cut, width: STROKE_TEETH },
      { d: JOINT, fill: cut, stroke: ink, width: STROKE_OUTLINE },
      { d: FILTER, fill: ink },
      ...TWISTS.map((d) => ({ d, stroke: ink, width: STROKE_TWIST, cap: "round" })),
      { d: BAND, stroke: ink, width: STROKE_BAND, cap: "round" },
      { circle: ASH_DOT, fill: ink },
    ];
  }
  const b = BRAND;
  return [
    ...(glow ? [{ glow: [EYE_L, EYE_R, GRIN], fill: b.aura }] : []),
    ...(smoke ? SMOKE.map((s) => ({ d: s.d, fill: { gradient: "smoke" }, opacity: s.opacity })) : []),
    { d: EYE_LID_L, fill: b.lid }, { d: EYE_L, fill: b.gold }, { d: PUPIL_L, fill: b.pupil },
    { d: EYE_LID_R, fill: b.lid }, { d: EYE_R, fill: b.gold }, { d: PUPIL_R, fill: b.pupil },
    ...GLINTS.map((g) => ({ circle: g, fill: b.cream })),
    { d: GRIN, fill: b.cream },
    { d: TEETH, stroke: b.ink, width: STROKE_TEETH },
    { circle: EMBER, fill: { gradient: "ember" } },
    { d: JOINT, fill: b.cream },
    { d: FILTER, fill: b.filter },
    { d: ASH, fill: b.ash },
    ...TWISTS.map((d) => ({ d, stroke: b.twist, width: STROKE_TWIST, cap: "round" })),
    { circle: ASH_DOT, fill: b.ashDot },
    { d: FILTER_EDGE, stroke: b.ink, width: STROKE_OUTLINE },
    { d: JOINT, stroke: b.ink, width: STROKE_OUTLINE, join: "round" },
    { d: BAND, stroke: b.ember, width: STROKE_BAND, cap: "round" },
  ];
}

/** Which box a mark is drawn in: the full artwork, or the face alone. */
export function markBox({ tone = "color", smoke = true } = {}) {
  return tone === "color" && smoke ? VIEWBOX_FULL : VIEWBOX_FACE;
}

/** Height over width for a mark drawn with these options. */
export function markAspect(opts) {
  const [, , w, h] = markBox(opts);
  return h / w;
}

function svgPaint(fill, id) {
  return typeof fill === "object" ? `url(#${id(fill.gradient)})` : fill;
}

/**
 * The mark as an SVG string. `uid` scopes the gradient and filter ids, so two
 * marks on one page cannot take each other's paint.
 */
export function catMarkSvg({ width = 120, tone = "color", smoke = true, glow = false, uid = "bcb", title = "" } = {}) {
  const box = markBox({ tone, smoke });
  const id = (name) => `${uid}-${name}`;
  const steps = markSteps({ tone, smoke, glow });
  const body = steps.map((s) => {
    if (s.glow) {
      return `<g filter="url(#${id("aura")})" opacity="0.75">${
        s.glow.map((d) => `<path d="${d}" fill="${s.fill}"/>`).join("")}</g>`;
    }
    const opacity = s.opacity !== undefined && s.opacity !== 1 ? ` opacity="${s.opacity}"` : "";
    if (s.circle) {
      return `<circle cx="${s.circle.cx}" cy="${s.circle.cy}" r="${s.circle.r}" fill="${svgPaint(s.fill, id)}"${opacity}/>`;
    }
    const fill = s.fill ? svgPaint(s.fill, id) : "none";
    const stroke = s.stroke
      ? ` stroke="${s.stroke}" stroke-width="${s.width}"${s.cap ? ` stroke-linecap="${s.cap}"` : ""}${s.join ? ` stroke-linejoin="${s.join}"` : ""}`
      : "";
    return `<path d="${s.d}" fill="${fill}"${stroke}${opacity}/>`;
  }).join("");
  const b = BRAND;
  const defs = tone === "color"
    ? `<defs>` +
      `<linearGradient id="${id("smoke")}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${b.smokeTop}"/><stop offset="0.6" stop-color="${b.smokeMid}"/>` +
        `<stop offset="1" stop-color="${b.smokeLow}" stop-opacity="0.7"/></linearGradient>` +
      `<radialGradient id="${id("ember")}"><stop offset="0" stop-color="${b.ember}" stop-opacity="0.6"/>` +
        `<stop offset="1" stop-color="${b.ember}" stop-opacity="0"/></radialGradient>` +
      `<filter id="${id("aura")}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="38"/></filter>` +
      `</defs>`
    : "";
  const height = Math.round(width * box[3] / box[2]);
  const label = title
    ? ` role="img" aria-label="${title.replace(/"/g, "&quot;")}"`
    : ` aria-hidden="true" focusable="false"`;
  return `<svg viewBox="${box.join(" ")}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"${label}>${defs}${body}</svg>`;
}

/**
 * The mark on a canvas, with its top-left at `x`, `y` and `w` wide. Glow is
 * drawn with a shadow rather than a filter, which older iOS canvases ignore.
 */
export function drawCatMark(ctx, x, y, w, { tone = "color", smoke = true, glow = false } = {}) {
  const [bx, by, bw] = markBox({ tone, smoke });
  const s = w / bw;
  const b = BRAND;
  const paint = (fill) => {
    if (typeof fill !== "object") return fill;
    if (fill.gradient === "smoke") {
      const g = ctx.createLinearGradient(0, 0, 0, 1240);
      g.addColorStop(0, b.smokeTop);
      g.addColorStop(0.6, b.smokeMid);
      g.addColorStop(1, "rgba(230,219,243,0.7)");
      return g;
    }
    const g = ctx.createRadialGradient(EMBER.cx, EMBER.cy, 0, EMBER.cx, EMBER.cy, EMBER.r);
    g.addColorStop(0, "rgba(255,105,42,0.6)");
    g.addColorStop(1, "rgba(255,105,42,0)");
    return g;
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-bx, -by);
  for (const step of markSteps({ tone, smoke, glow })) {
    ctx.save();
    if (step.opacity !== undefined) ctx.globalAlpha = step.opacity;
    if (step.glow) {
      ctx.globalAlpha = 0.75;
      ctx.shadowColor = step.fill;
      ctx.shadowBlur = 90 * s;
      ctx.fillStyle = step.fill;
      for (const d of step.glow) ctx.fill(new Path2D(d));
      ctx.restore();
      continue;
    }
    if (step.circle) {
      ctx.beginPath();
      ctx.arc(step.circle.cx, step.circle.cy, step.circle.r, 0, Math.PI * 2);
      ctx.fillStyle = paint(step.fill);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const path = new Path2D(step.d);
    if (step.fill) { ctx.fillStyle = paint(step.fill); ctx.fill(path); }
    if (step.stroke) {
      ctx.strokeStyle = step.stroke;
      ctx.lineWidth = step.width;
      ctx.lineCap = step.cap ?? "butt";
      ctx.lineJoin = step.join ?? "miter";
      ctx.stroke(path);
    }
    ctx.restore();
  }
  ctx.restore();
}
