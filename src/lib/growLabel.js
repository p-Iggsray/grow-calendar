// The product label: what goes on it, and how it is drawn.
//
// Six inches by four, landscape, at 300 dots per inch, in pure black on white.
// No greys, no tints, no colour: a thermal head has one ink and one dot size,
// so hierarchy has to come from weight, size and rule thickness. Anything
// rendered as a mid-grey arrives as a muddy dither, or as nothing.
//
// The fold from a strain to the label's rows is pure and tested. The drawing
// takes a canvas and is judged by looking at it.

import {
  CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_PUPILS, CAT_NOSE, CAT_MOUTH, CAT_WHISKERS,
} from "./catMark.js";

// 6in x 4in at 300dpi. Fixed, so what is saved is what prints.
export const LABEL_W = 1800;
export const LABEL_H = 1200;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A stored YYYY-MM-DD as a label would print it. */
export function labelDate(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!MONTHS[m - 1]) return null;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const VARIETY_WORD = {
  indica: "Indica", sativa: "Sativa", hybrid: "Hybrid",
  photo: "Photoperiod", auto: "Autoflower",
  cube: "Cubensis", oyster: "Oyster", lions: "Lion's Mane", other: null,
};

function clean(v, max = 60) {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

/**
 * A potency reading, as a percentage.
 *
 * Potency is only ever a percentage, so typing the sign is busywork: a bare
 * number gets one. Anything else is left exactly as written, because "< 0.1%",
 * "ND" and "24.8 %" are all things a grower might mean on purpose and none of
 * them are improved by a machine appending a second sign.
 */
function percent(v) {
  const t = clean(v, 12);
  return t && /^\d+(\.\d+)?$/.test(t) ? `${t}%` : t;
}

/**
 * The label's fields, prefilled from what the app knows.
 *
 * This is a draft, not the finished thing: every value is a plain string the
 * grower can edit before printing, because a label is a claim about a specific
 * jar and only the person holding it knows the weight, the potency, or which
 * day it actually got packed.
 */
export function labelDraft(strain, plant, todayKey) {
  return {
    name: clean(strain?.name, 40) ?? "",
    // Just the variety. Whether it is a photoperiod and the fact that cannabis
    // is cannabis are things the grower knows and the jar does not need told;
    // indica or sativa is the one word on here that changes what you reach for.
    classification: VARIETY_WORD[strain?.type] ?? "",
    netWeight: "",
    thc: "",
    cbd: "",
    terpenes: [],
    harvested: labelDate(plant?.harvestedOn ?? strain?.lastGrown) ?? "",
    packaged: labelDate(todayKey) ?? "",
    batch: "",
  };
}

/** A terpene row is only worth printing once it has a name. */
export function cleanTerpenes(list) {
  return (Array.isArray(list) ? list : [])
    .map((t) => ({ name: clean(t?.name, 22), pct: clean(t?.pct, 8) }))
    .filter((t) => t.name)
    .slice(0, 6);
}

/**
 * The draft as the label prints it.
 *
 * Only names and numbers. Every row is a short tag over a value, and there is
 * no prose anywhere: a jar has no room for a sentence, and a sentence printed
 * at a size that fits is a sentence nobody reads.
 *
 * A field with nothing behind it is left out rather than printed empty: a label
 * reading "THC: -" is worse than one that does not mention THC, and on a four
 * by six there is no room to spend on blanks.
 */
export function labelFields(draft = {}) {
  const rows = [];
  const push = (label, value) => { if (value) rows.push({ label, value }); };

  push("Net weight", clean(draft.netWeight, 24));
  const thc = percent(draft.thc);
  const cbd = percent(draft.cbd);
  if (thc && cbd) push("THC / CBD", `${thc}  /  ${cbd}`);
  else if (thc) push("THC", thc);
  else if (cbd) push("CBD", cbd);
  push("Harvested", clean(draft.harvested, 24));
  push("Packaged", clean(draft.packaged, 24));
  push("Batch", clean(draft.batch, 24));

  return {
    name: clean(draft.name, 40) ?? "Unnamed",
    variety: clean(draft.classification, 24) ?? "",
    rows,
    terpenes: cleanTerpenes(draft.terpenes),
  };
}

// ── Drawing ─────────────────────────────────────────────────────────────────

// Every size below is in device pixels at 300dpi, so 4.167px is one point. A
// thermal head spreads its dots, and small type closes up into a grey smear on
// the stock, which is what the first version of this label did wrong: its tags
// were 5.8pt and its foot was 5.3pt. Nothing you actually read here is under
// 9pt now, and the only thing below that is the boilerplate legal line.
const BLACK = "#000";
const WHITE = "#fff";

const FRAME_INSET = 30;   // outer rule, in from the trim
const INNER_INSET = 48;   // hairline inside it
const PAD = 84;           // where content starts

const BAR_H = 170;        // the reversed masthead across the head
const TAG_PX = 38;        // field tags: NET WEIGHT, THC / CBD
const VALUE_PX = 78;      // the numbers themselves
const VALUE_MIN = 44;
const TERP_MIN = 32;   // the terpene line shrinks to here, then sheds names

function drawQr(ctx, matrix, x, y, box) {
  const n = matrix.size;
  // Whole pixels per module, so no module lands on a half pixel and greys out.
  const cell = Math.max(1, Math.floor(box / (n + 8)));
  const side = cell * n;
  const quiet = Math.floor((box - side) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, box, box);
  ctx.fillStyle = BLACK;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix.modules[r][c]) ctx.fillRect(x + quiet + c * cell, y + quiet + r * cell, cell, cell);
    }
  }
  return { side, quiet };
}

/**
 * The brand mark in one ink.
 *
 * A thermal head has one dot and no greys, so every bit of the face has to be
 * cut out of the black rather than shaded onto it: the eyes, the pupils inside
 * them, the nose and the muzzle line are all white knockouts. The whiskers are
 * laid down first and the head painted over their roots, so each one leaves
 * the cheek instead of crossing it.
 *
 * `x`, `y` is the top-left of the drawn mark; it comes out `w * 0.99` wide and
 * `w * 0.85` tall. `invert` swaps the two inks, for the mark sitting in the
 * black brand bar.
 */
function drawCatMark(ctx, x, y, w, invert = false) {
  const coat = invert ? WHITE : BLACK;
  const cut = invert ? BLACK : WHITE;
  const s = w / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-0.5, -4);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.fillStyle = coat;
  for (const d of CAT_WHISKERS) ctx.fill(new Path2D(d));
  ctx.fill(new Path2D(CAT_HEAD));

  ctx.fillStyle = cut;
  ctx.fill(new Path2D(CAT_EYE_L));
  ctx.fill(new Path2D(CAT_EYE_R));
  ctx.fill(new Path2D(CAT_NOSE));
  ctx.strokeStyle = cut;
  ctx.lineWidth = 1.7;
  for (const d of CAT_MOUTH) ctx.stroke(new Path2D(d));

  ctx.fillStyle = coat;
  for (const p of CAT_PUPILS) {
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Letterspaced small caps, drawn a glyph at a time because canvas has no
// letter-spacing. Tracking is what keeps a 40px tag from reading as a blob at
// this size, and it is most of what makes the label look set rather than typed.
function drawTracked(ctx, text, x, y, track, align = "left") {
  const chars = [...text];
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width + track, -track);
  let cx = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + track;
  }
  return width;
}

function trackedWidth(ctx, text, track) {
  const chars = [...text];
  return chars.reduce((w, c) => w + ctx.measureText(c).width + track, -track);
}

// Shrink a line until it fits the width it is given, rather than letting a long
// strain name run off the edge of the stock.
function fitText(ctx, text, maxWidth, startPx, family, weight, minPx = 24) {
  let px = startPx;
  for (;;) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || px <= minPx) return px;
    px -= 2;
  }
}

const UI = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const MONO = `"Courier New", Courier, monospace`;

/**
 * Draw a label onto a canvas already sized to LABEL_W x LABEL_H.
 *
 * `matrix` is a qrMatrix() result, or null for no code.
 */
export function drawLabel(canvas, spec, matrix) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.textBaseline = "alphabetic";

  const right = LABEL_W - PAD;
  const bottom = LABEL_H - PAD;

  // Two frames: a heavy one on the trim and a hairline just inside it. The gap
  // between them is what reads as a printed border rather than a drawn box,
  // and it gives the eye an edge to sit against on a white stock.
  ctx.lineWidth = 5;
  ctx.strokeRect(FRAME_INSET + 2.5, FRAME_INSET + 2.5,
    LABEL_W - (FRAME_INSET + 2.5) * 2, LABEL_H - (FRAME_INSET + 2.5) * 2);
  ctx.lineWidth = 2;
  ctx.strokeRect(INNER_INSET + 1, INNER_INSET + 1,
    LABEL_W - (INNER_INSET + 1) * 2, LABEL_H - (INNER_INSET + 1) * 2);

  // The masthead: solid black across the head with the mark and the wordmark
  // knocked out of it. The cat is the biggest thing on the label after the
  // strain's own name, because the jar should say whose it is before it says
  // anything else.
  const barTop = PAD;
  ctx.fillStyle = BLACK;
  ctx.fillRect(PAD, barTop, right - PAD, BAR_H);

  // The mark is centred in the bar rather than hung from its top: at this size
  // it is taller than the bar used to be, and its chin and whiskers were
  // spilling out below the black into white, where white ink is nothing.
  const markW = 152;
  const markH = markW * 0.85;
  drawCatMark(ctx, PAD + 40, barTop + (BAR_H - markH) / 2, markW, true);
  ctx.fillStyle = WHITE;
  ctx.font = `800 56px ${UI}`;
  drawTracked(ctx, "BLACK CAT BOTANICALS", PAD + 40 + markW + 34, barTop + BAR_H / 2 + 20, 3.6);
  ctx.fillStyle = BLACK;

  const nameTop = barTop + BAR_H;
  const namePx = fitText(ctx, spec.name, right - PAD, 148, UI, 800, 58);
  ctx.font = `800 ${namePx}px ${UI}`;
  ctx.fillText(spec.name, PAD, nameTop + 138);

  // Indica or sativa, in its own reversed chip under the name. It is the one
  // word here that changes what you reach for, so it gets a shape of its own
  // rather than a line of small caps that reads as a caption.
  let headRule = nameTop + 178;
  if (spec.variety) {
    ctx.font = `800 40px ${UI}`;
    const word = spec.variety.toUpperCase();
    const chipW = trackedWidth(ctx, word, 5) + 52;
    const chipTop = nameTop + 186;
    ctx.fillRect(PAD, chipTop, chipW, 68);
    ctx.fillStyle = WHITE;
    drawTracked(ctx, word, PAD + 26, chipTop + 48, 5);
    ctx.fillStyle = BLACK;
    headRule = chipTop + 96;
  }

  // A heavy rule closes the head and opens the data, with a hairline under it
  // that echoes the frame.
  ctx.fillRect(PAD, headRule, right - PAD, 8);
  ctx.fillRect(PAD, headRule + 16, right - PAD, 2);

  // The QR sits in the lower right with nothing written under it. A square of
  // code on a jar does not need to be captioned.
  const qrBox = 396;
  const qrX = right - qrBox;

  const gridRight = matrix ? qrX - 64 : right;
  const gridW = gridRight - PAD;
  const colW = Math.floor(gridW / 2);

  // Nothing sits along the foot any more, so the data runs to the bottom of
  // the frame and gets the room the legal line used to take.
  const footRule = bottom + 10;

  // Terpenes, in a band at the foot: a black tab with the word knocked out,
  // then the names and what they measured on one mono line.
  let gridBottom = footRule - 28;
  if (spec.terpenes.length) {
    const bandTop = footRule - 140;
    ctx.fillRect(PAD, bandTop, right - PAD, 3);

    ctx.font = `800 ${TAG_PX}px ${UI}`;
    const tabW = trackedWidth(ctx, "TERPENES", 3.4) + 44;
    ctx.fillRect(PAD, bandTop + 22, tabW, 62);
    ctx.fillStyle = WHITE;
    drawTracked(ctx, "TERPENES", PAD + 22, bandTop + 66, 3.4);
    ctx.fillStyle = BLACK;

    // Six long terpenes do not fit on one line at a size worth printing, and
    // fitText returns its floor whether or not the text fits, so on its own it
    // would run the list off the edge of the stock. Shrink first, then drop
    // from the end until what is left actually fits. The preview shows the
    // drop, so a list that is too long is visibly too long before it prints.
    const room = right - PAD - tabW - 34;
    const join = (list) => list.map((t) => (t.pct ? `${t.name} ${t.pct}` : t.name)).join("   ·   ");
    let shown = spec.terpenes;
    let text = join(shown);
    let px = fitText(ctx, text, room, 52, MONO, 700, TERP_MIN);
    while (shown.length > 1 && ctx.measureText(text).width > room) {
      shown = shown.slice(0, -1);
      text = join(shown);
      px = fitText(ctx, text, room, 52, MONO, 700, TERP_MIN);
    }
    ctx.font = `700 ${px}px ${MONO}`;
    ctx.fillText(text, PAD + tabW + 34, bandTop + 66);
    gridBottom = bandTop - 28;
  }

  // The rows fill whatever is left between the head rule and whatever comes
  // next. Two columns, tag over value, so a long value never collides with its
  // own tag. Rows are divided by one hairline across the whole grid rather than
  // a rule under each value: six short underlines in a stack read as clutter,
  // and they crowd the tag of the row underneath.
  const blockTop = headRule + 62;
  const blockH = gridBottom - blockTop;
  const lines = Math.max(1, Math.ceil(spec.rows.length / 2));
  // Spread the rows from the top of the block to the bottom of it. Dividing the
  // space by the row count instead would leave the last row short of the floor
  // by one row's worth of slack, which reads as a hole above the terpenes.
  const ROW_H = 100;
  // Capped well short of the room available: left to stretch, two rows drift
  // to opposite ends of the block and stop reading as a pair. Rows keep a
  // steady pitch and the slack goes to the margins instead.
  const pitch = lines > 1
    ? Math.max(140, Math.min(172, Math.floor((blockH - ROW_H) / (lines - 1))))
    : 0;
  // Whatever the rows do not use is split above and below them, so a jar with
  // two facts on it looks composed rather than abandoned half way down.
  const rowsH = (lines - 1) * pitch + ROW_H;
  const gridTop = blockTop + Math.max(0, Math.floor((blockH - rowsH) / 2));

  if (matrix) {
    drawQr(ctx, matrix, qrX, blockTop + Math.max(0, Math.floor((blockH - qrBox) / 2)), qrBox);
  }

  spec.rows.forEach((row, i) => {
    const cx = PAD + (i % 2) * colW;
    const line = Math.floor(i / 2);
    const cy = gridTop + line * pitch;
    const tag = row.label.toUpperCase();

    // The tag and its value sit centred on each other. A date is wider than the
    // word above it and a weight is narrower, so whichever is wider keeps the
    // column's left edge and the other centres on it. Centring both in the cell
    // instead would pull the whole block off the margin the chip and the
    // terpene tab line up against.
    ctx.font = `800 ${TAG_PX}px ${UI}`;
    const tagW = trackedWidth(ctx, tag, 3);
    const valuePx = fitText(ctx, row.value, colW - 48, VALUE_PX, MONO, 700, VALUE_MIN);
    ctx.font = `700 ${valuePx}px ${MONO}`;
    const valueW = ctx.measureText(row.value).width;
    const mid = cx + Math.max(tagW, valueW) / 2;

    ctx.fillText(row.value, mid - valueW / 2, cy + 76);
    ctx.font = `800 ${TAG_PX}px ${UI}`;
    drawTracked(ctx, tag, mid, cy, 3, "center");

    if (line < lines - 1) ctx.fillRect(PAD, cy + 100, gridW, 2);
  });
}
