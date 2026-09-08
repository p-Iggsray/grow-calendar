// The product label: what goes on it, and how it is drawn.
//
// Six inches by four, landscape, at 300 dots per inch, in pure black on white.
// No greys, no tints, no colour: a thermal head has one ink and one dot size,
// so hierarchy has to come from weight, size and rule thickness. Anything
// rendered as a mid-grey arrives as a muddy dither, or as nothing.
//
// The fold from a strain to the label's rows is pure and tested. The drawing
// takes a canvas and is judged by looking at it.

import { words } from "./crops.js";

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
 * Everything the label prints, in the order it prints it.
 *
 * A field with nothing behind it is left out rather than printed empty: a label
 * reading "THC: -" is worse than a label that does not mention THC, and on a
 * four by six there is no room to spend on blanks.
 */
export function labelFields(strain, extras = {}, todayKey = null) {
  const w = words(strain?.crop);
  const name = clean(strain?.name, 40) ?? "Unnamed";

  // The line under the name: what kind of thing this is.
  const kind = [
    VARIETY_WORD[strain?.type] ?? null,
    strain?.crop === "mushrooms" ? null
      : strain?.photo === false ? "Autoflower"
      : strain?.photo === true ? "Photoperiod" : null,
    w.cropLabel,
  ].filter(Boolean);
  // "Photoperiod" can arrive from both type and the photo flag; say it once.
  const subtitle = [...new Set(kind)].join("  ·  ");

  const rows = [];
  const push = (label, value) => { if (value) rows.push({ label, value }); };

  push("Net weight", clean(extras.netWeight, 24));
  const thc = clean(extras.thc, 12);
  const cbd = clean(extras.cbd, 12);
  if (thc && cbd) push("THC / CBD", `${thc}  /  ${cbd}`);
  else if (thc) push("THC", thc);
  else if (cbd) push("CBD", cbd);

  push("Harvested", labelDate(strain?.lastGrown));
  push("Packaged", labelDate(todayKey));
  push("Grown in", clean(strain?.grows?.[strain.grows.length - 1]?.growName, 28));
  if (strain?.crop !== "mushrooms" && Number.isFinite(Number(strain?.flowerWeeks)) && Number(strain.flowerWeeks) > 0) {
    push("Flower time", `${Number(strain.flowerWeeks)} weeks`);
  }

  return {
    name,
    subtitle,
    rows,
    rating: Math.max(0, Math.min(5, Math.round(Number(strain?.rating) || 0))),
    note: clean(extras.note ?? strain?.note, 150),
    qrText: clean(extras.qrText, 200),
  };
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const PAD = 90;
const BLACK = "#000";

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

// A five-pointed star, filled or outlined, for the rating.
function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) ctx.fill(); else { ctx.lineWidth = 5; ctx.stroke(); }
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
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.textBaseline = "alphabetic";

  // A heavy rule across the head, and a hairline under it: the cheapest way to
  // make a label look printed rather than typed.
  ctx.fillRect(PAD, PAD, LABEL_W - PAD * 2, 14);
  ctx.fillRect(PAD, PAD + 26, LABEL_W - PAD * 2, 3);

  const qrBox = 380;
  const qrX = LABEL_W - PAD - qrBox;
  const textRight = matrix ? qrX - 60 : LABEL_W - PAD;
  const textWidth = textRight - PAD;

  // Name.
  let y = PAD + 150;
  const namePx = fitText(ctx, spec.name, textWidth, 132, UI, 800, 44);
  ctx.font = `800 ${namePx}px ${UI}`;
  ctx.fillText(spec.name, PAD, y);

  // What kind of thing it is.
  if (spec.subtitle) {
    y += 52;
    ctx.font = `600 30px ${UI}`;
    ctx.fillText(spec.subtitle.toUpperCase(), PAD, y);
  }

  // The rating, as stars, only when it was actually rated.
  if (spec.rating > 0) {
    y += 58;
    for (let i = 0; i < 5; i++) star(ctx, PAD + 20 + i * 54, y - 8, 22, i < spec.rating);
  }

  // The table stretches to fill whatever is left between the head and the
  // foot, rather than sitting at a fixed pitch and leaving a quarter of the
  // stock blank underneath. Two columns, label above value, so a long value
  // never collides with its own label.
  const tableTop = y + 82;
  const colW = Math.floor(textWidth / 2);
  const noteRoom = spec.note ? 90 : 30;
  const tableBottom = LABEL_H - PAD - 60 - noteRoom;
  const lines = Math.max(1, Math.ceil(spec.rows.length / 2));
  const pitch = Math.max(112, Math.min(190, Math.floor((tableBottom - tableTop) / lines)));
  spec.rows.forEach((row, i) => {
    const cx = PAD + (i % 2) * colW;
    const cy = tableTop + Math.floor(i / 2) * pitch;
    ctx.font = `700 24px ${UI}`;
    ctx.fillText(row.label.toUpperCase(), cx, cy);
    const valuePx = fitText(ctx, row.value, colW - 40, 52, MONO, 700, 22);
    ctx.font = `700 ${valuePx}px ${MONO}`;
    ctx.fillText(row.value, cx, cy + 58);
    ctx.fillRect(cx, cy + 78, colW - 40, 2);
  });

  // The QR, with a caption under it so nobody has to guess what it is for.
  if (matrix) {
    drawQr(ctx, matrix, qrX, PAD + 90, qrBox);
    ctx.font = `600 22px ${UI}`;
    ctx.textAlign = "center";
    ctx.fillText("SCAN FOR THE FULL", qrX + qrBox / 2, PAD + 90 + qrBox + 40);
    ctx.fillText("GROW RECORD", qrX + qrBox / 2, PAD + 90 + qrBox + 70);
    ctx.textAlign = "left";
  }

  // The note, along the foot, above the closing rules.
  const footRule = LABEL_H - PAD - 60;
  if (spec.note) {
    ctx.font = `italic 26px ${UI}`;
    const maxW = LABEL_W - PAD * 2;
    let line = spec.note;
    while (ctx.measureText(line).width > maxW && line.length > 4) line = line.slice(0, -2);
    if (line !== spec.note) line = line.slice(0, -1) + "…";
    ctx.fillText(line, PAD, footRule - 26);
  }
  ctx.fillRect(PAD, footRule, LABEL_W - PAD * 2, 3);
  ctx.font = `600 22px ${UI}`;
  ctx.fillText("THE GROW CALENDAR", PAD, footRule + 40);
  ctx.textAlign = "right";
  ctx.fillText("KEEP OUT OF REACH OF CHILDREN", LABEL_W - PAD, footRule + 40);
  ctx.textAlign = "left";
}
