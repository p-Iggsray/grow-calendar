// The colour label: the same jar, set the way a shelf would want it.
//
// Six by four at 300dpi like its black-and-white twin, and fed by exactly the
// same labelFields() spec, so flipping between the two never changes a word.
// What changes is everything about how it is set.
//
// It is built for a home inkjet or laser, which is why the ink stops well short
// of the trim: a desktop printer cannot print to the edge of a sheet, so a
// design that bleeds comes back with a white hairline down one side and the
// composition off-centre. The dark ground is a PANEL inside a white margin
// instead. That keeps the brand's near-black without asking the printer for
// something it cannot do. It is still a lot of toner; on a laser it comes out
// crisp, on an inkjet give it a minute before it goes near a jar.
//
// The palette is the app's own and nothing else: near-black ground, hazel, and
// a warm off-white for type. Every jar on the shelf reads as one brand, which
// is the entire job of a brand.

import {
  CAT_HEAD, CAT_INNER_EARS, CAT_EYE_L, CAT_EYE_R, CAT_PUPILS, CAT_GLINTS,
  CAT_NOSE, CAT_MOUTH, CAT_WHISKERS,
} from "./catMark.js";
import { LABEL_W, LABEL_H } from "./growLabel.js";

export { LABEL_W, LABEL_H };

// The app's palette, verbatim. See src/styles.css.
const INK = "#0c0b0a";        // near-black ground
const INK_LIFT = "#17130e";   // the top of the ground's gradient
const HAZEL = "#e0913f";
const HAZEL_LIT = "#f0ad5f";  // the lit edge of a hazel face
const HAZEL_DEEP = "#b8712c"; // its shadowed edge
const CREAM = "#f5f0e8";
const MUTED = "#a0917c";
const PAPER = "#ffffff";

// A desktop printer holds about 0.17in of margin at best. 60px at 300dpi is
// 0.2in, which clears every consumer tray without eating the composition.
const MARGIN = 60;
const RADIUS = 34;
const PAD = 62;               // panel edge to content

const UI = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const MONO = `"Courier New", Courier, monospace`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Canvas has no letter-spacing, so tracked caps are drawn a glyph at a time.
// Tracking is most of what separates set type from typed type at this size.
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
  return [...text].reduce((w, c) => w + ctx.measureText(c).width + track, -track);
}

function fitText(ctx, text, maxWidth, startPx, family, weight, minPx = 24) {
  let px = startPx;
  for (;;) {
    ctx.font = `${weight} ${px}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || px <= minPx) return px;
    px -= 2;
  }
}

/**
 * A hazel face with light falling across it.
 *
 * Flat hazel on near-black reads as a sticker. A two-stop gradient down the
 * shape, lit at the top and deepened at the bottom, is what makes the chips and
 * the potency badge read as something pressed into the label rather than
 * painted onto it. It is the cheapest imitation of foil there is and it costs
 * one gradient.
 */
function hazelFace(ctx, y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, HAZEL_LIT);
  g.addColorStop(0.55, HAZEL);
  g.addColorStop(1, HAZEL_DEEP);
  return g;
}

/**
 * The mark, as the app draws it, which is the whole point of having colour.
 *
 * The cat is BLACK. The brand is called Black Cat, and the mark in catMarkSvg()
 * is a black head carried by a hazel outline, with hazel eyes and a dark slit
 * in each. Filling the head with hazel instead makes a ginger cat, which is a
 * different animal and a different brand.
 *
 * The thermal label cannot do any of that: one ink means the cat has to be a
 * solid silhouette with its face knocked out white. Here it is the real mark,
 * and it gets the two details that only exist in colour and have never been
 * printed before: the inner ears, and a glint in each eye.
 */
function drawCatMark(ctx, x, y, w) {
  const s = w / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-0.5, -4);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Whiskers first, then the head over their roots, so each one grows out from
  // behind the cheek instead of crossing it.
  ctx.fillStyle = HAZEL;
  for (const d of CAT_WHISKERS) ctx.fill(new Path2D(d));

  // A hair lighter than the panel, so a black cat on a near-black ground still
  // has a body rather than being a hazel outline around nothing.
  const coat = ctx.createLinearGradient(0, 0, 0, 90);
  coat.addColorStop(0, "#221c15");
  coat.addColorStop(1, "#0f0d0b");
  ctx.fillStyle = coat;
  const head = new Path2D(CAT_HEAD);
  ctx.fill(head);
  ctx.strokeStyle = HAZEL;
  ctx.lineWidth = 2.8;
  ctx.stroke(head);

  ctx.fillStyle = "rgba(224,145,63,0.32)";
  for (const d of CAT_INNER_EARS) ctx.fill(new Path2D(d));

  ctx.fillStyle = HAZEL;
  ctx.fill(new Path2D(CAT_EYE_L));
  ctx.fill(new Path2D(CAT_EYE_R));
  ctx.fill(new Path2D(CAT_NOSE));
  ctx.strokeStyle = HAZEL;
  ctx.lineWidth = 1.7;
  for (const d of CAT_MOUTH) ctx.stroke(new Path2D(d));

  // The slit is the ground showing through the eye.
  ctx.fillStyle = INK;
  for (const p of CAT_PUPILS) {
    ctx.beginPath();
    ctx.ellipse(p.cx, p.cy, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = CREAM;
  for (const g of CAT_GLINTS) {
    ctx.beginPath();
    ctx.ellipse(g.cx, g.cy, g.r, g.r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The QR, on a white tile.
 *
 * A code printed light-on-dark scans badly and on some readers not at all, so
 * the code keeps its white ground and its quiet zone wherever the label around
 * it goes. Whole pixels per module, so no module lands on a half pixel and
 * greys out.
 */
function drawQr(ctx, matrix, x, y, box) {
  const n = matrix.size;
  const cell = Math.max(1, Math.floor(box / (n + 8)));
  const side = cell * n;
  const quiet = Math.floor((box - side) / 2);

  ctx.fillStyle = PAPER;
  roundRect(ctx, x, y, box, box, 16);
  ctx.fill();
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix.modules[r][c]) {
        ctx.fillRect(x + quiet + c * cell, y + quiet + r * cell, cell, cell);
      }
    }
  }
}

/** A small caps tag in hazel, the label's one voice for naming a field. */
function tag(ctx, text, x, y, px = 30) {
  ctx.font = `800 ${px}px ${UI}`;
  ctx.fillStyle = HAZEL;
  drawTracked(ctx, text.toUpperCase(), x, y, 3.4);
}

/**
 * Draw the colour label onto a canvas already sized to LABEL_W x LABEL_H.
 *
 * `spec` is a labelFields() result, identical to the one the black-and-white
 * label takes. `matrix` is a qrMatrix() result, or null for no code.
 */
export function drawColorLabel(canvas, spec, matrix) {
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  // The sheet. White to the trim, because the printer decides where the trim
  // actually falls and it is never quite where the file says.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, LABEL_W, LABEL_H);

  // The panel: the near-black ground, lifted slightly at the top so a large
  // flat field has somewhere for the eye to go.
  const px0 = MARGIN;
  const py0 = MARGIN;
  const pw = LABEL_W - MARGIN * 2;
  const ph = LABEL_H - MARGIN * 2;
  const ground = ctx.createLinearGradient(0, py0, 0, py0 + ph);
  ground.addColorStop(0, INK_LIFT);
  ground.addColorStop(0.45, INK);
  ground.addColorStop(1, INK);
  ctx.fillStyle = ground;
  roundRect(ctx, px0, py0, pw, ph, RADIUS);
  ctx.fill();

  // A hazel hairline just inside the panel edge. It is what tells the eye the
  // dark is deliberate rather than a printing accident.
  ctx.strokeStyle = "rgba(224,145,63,0.45)";
  ctx.lineWidth = 3;
  roundRect(ctx, px0 + 16, py0 + 16, pw - 32, ph - 32, RADIUS - 10);
  ctx.stroke();

  const left = px0 + PAD;
  const right = px0 + pw - PAD;
  const bottom = py0 + ph - PAD;

  // ── Masthead ──────────────────────────────────────────────────────────────
  const markW = 116;
  const markTop = py0 + PAD - 6;
  drawCatMark(ctx, left, markTop, markW);

  ctx.font = `800 40px ${UI}`;
  ctx.fillStyle = CREAM;
  drawTracked(ctx, "BLACK CAT BOTANICALS", left + markW + 30, markTop + 58, 5.2);
  ctx.font = `600 23px ${UI}`;
  ctx.fillStyle = MUTED;
  drawTracked(ctx, "CULTIVATED AND PACKED BY HAND", left + markW + 32, markTop + 96, 3.4);

  const headRule = markTop + 132;
  ctx.fillStyle = "rgba(224,145,63,0.55)";
  ctx.fillRect(left, headRule, right - left, 3);

  // ── The name, and what it is ──────────────────────────────────────────────
  // The code sits beside the name rather than under everything. Parked in the
  // bottom corner it left a hole the size of a fist in the upper right, because
  // the name, the chip and the badge are all left-aligned and none of them is
  // wide. Up here it balances them, and the data and the terpenes below it get
  // the full width of the panel instead of stopping short of a square.
  const qrBox = 316;
  const qrX = right - qrBox;
  const headW = matrix ? qrX - 52 - left : right - left;

  // ── Where the stack starts ────────────────────────────────────────────────
  // A jar with two facts on it must not look abandoned, and the empty label is
  // the one a grower sees every single time this sheet opens, before they have
  // typed a word. So the blocks are measured before any of them is drawn and
  // the slack is spread through the gaps between them, rather than piling up
  // underneath. A full label fills the panel; a bare one sits composed in the
  // middle of it instead of clinging to the top.
  const potency = spec.rows.find((r) => /^THC/.test(r.label)) ?? spec.rows.find((r) => r.label === "CBD");
  const gridRows = spec.rows.filter((r) => r !== potency);
  const cols = gridRows.length > 4 ? 3 : 2;
  const gridLines = Math.ceil(gridRows.length / cols);
  const ROW_PITCH = 104;

  const namePx = fitText(ctx, spec.name, headW, 132, UI, 800, 54);
  const heights = [namePx + 16];
  if (spec.variety) heights.push(60);
  if (potency) heights.push(124);
  if (gridLines) heights.push((gridLines - 1) * ROW_PITCH + 96);
  if (spec.terpenes.length) heights.push(92);

  const MIN_GAP = 26;
  const natural = heights.reduce((a, b) => a + b, 0) + MIN_GAP * (heights.length - 1);
  const top = headRule + 30;
  const avail = bottom - top;
  // Slack goes into the gaps first, capped so a two-block label does not pull
  // its own pieces apart, and whatever is left over centres the stack.
  const slots = heights.length + 1;
  const extra = Math.max(0, Math.min(72, Math.floor((avail - natural) / slots)));
  const gap = MIN_GAP + extra;
  const stackH = heights.reduce((a, b) => a + b, 0) + gap * (heights.length - 1);
  const stackTop = top + Math.max(0, Math.floor((avail - stackH) / 2));
  const qrY = stackTop;

  const nameTop = stackTop;
  ctx.font = `800 ${namePx}px ${UI}`;
  ctx.fillStyle = CREAM;
  ctx.fillText(spec.name, left, nameTop + namePx);

  let chipBottom = nameTop + heights[0];
  if (spec.variety) {
    const word = spec.variety.toUpperCase();
    ctx.font = `800 34px ${UI}`;
    const chipW = trackedWidth(ctx, word, 4.6) + 46;
    const chipH = 60;
    const chipTop = chipBottom + gap;
    ctx.fillStyle = hazelFace(ctx, chipTop, chipH);
    roundRect(ctx, left, chipTop, chipW, chipH, 12);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `800 34px ${UI}`;
    drawTracked(ctx, word, left + 23, chipTop + 42, 4.6);
    chipBottom = chipTop + chipH;
  }

  // ── Potency, as the thing a shelf reads first ─────────────────────────────
  // A real product label leads with the number, so it gets a face of its own
  // rather than a row in the grid. Whichever of THC and CBD was filled in wins
  // the bar; a label with neither simply does not have one.
  //
  // A bar the width of the head block, not a small chip: the name, the variety
  // and the potency are the three things read from across a room, and a narrow
  // badge left a hole beside it the size of the code. Tag at one end, number at
  // the other, the way a spec bar reads.
  let dataTop = chipBottom + gap;
  if (potency) {
    const badgeH = 124;
    const label = potency.label.toUpperCase();

    ctx.fillStyle = hazelFace(ctx, dataTop, badgeH);
    roundRect(ctx, left, dataTop, headW, badgeH, 16);
    ctx.fill();

    const mid = dataTop + badgeH / 2;
    ctx.font = `800 30px ${UI}`;
    ctx.fillStyle = "rgba(12,11,10,0.66)";
    drawTracked(ctx, label, left + 34, mid + 11, 3.8);

    ctx.font = `800 30px ${UI}`;
    const labelW = trackedWidth(ctx, label, 3.8);
    const valuePx = fitText(ctx, potency.value, headW - labelW - 110, 74, MONO, 700, 40);
    ctx.font = `700 ${valuePx}px ${MONO}`;
    ctx.fillStyle = INK;
    const valueW = ctx.measureText(potency.value).width;
    ctx.fillText(potency.value, left + headW - 34 - valueW, mid + valuePx * 0.36);

    dataTop += badgeH + gap;
  }

  // ── The rest of the facts ─────────────────────────────────────────────────
  // Full width now, because the code is up beside the name. Three columns when
  // there are enough facts to fill them, two when there are not: four values in
  // three columns leaves an orphan on its own line, which reads as a mistake.
  const colW = Math.floor((right - left) / cols);

  gridRows.forEach((row, i) => {
    const cx = left + (i % cols) * colW;
    const cy = dataTop + Math.floor(i / cols) * ROW_PITCH;
    tag(ctx, row.label, cx, cy + 26);
    const valuePx = fitText(ctx, row.value, colW - 30, 46, MONO, 700, 26);
    ctx.font = `700 ${valuePx}px ${MONO}`;
    ctx.fillStyle = CREAM;
    ctx.fillText(row.value, cx, cy + 78);
  });
  if (gridLines) dataTop += (gridLines - 1) * ROW_PITCH + 96 + gap;

  // ── Terpenes, closing the stack ───────────────────────────────────────────
  // Each one gets a hazel dot instead of a separator, which is the one place
  // colour buys something the black-and-white label genuinely cannot have.
  if (spec.terpenes.length) {
    const bandTop = dataTop + 62;
    ctx.fillStyle = "rgba(224,145,63,0.3)";
    ctx.fillRect(left, dataTop, right - left, 2);

    tag(ctx, "Terpenes", left, bandTop, 26);
    ctx.font = `800 26px ${UI}`;
    let tx = left + trackedWidth(ctx, "TERPENES", 3.4) + 34;

    for (const t of spec.terpenes) {
      const text = t.pct ? `${t.name} ${t.pct}` : t.name;
      ctx.font = `700 30px ${MONO}`;
      const w = ctx.measureText(text).width;
      // Drop the rest rather than running off the panel. The preview shows the
      // drop, so a list that is too long is visibly too long before it prints.
      if (tx + 24 + w > right) break;
      ctx.fillStyle = HAZEL;
      ctx.beginPath();
      ctx.ellipse(tx + 7, bandTop - 10, 7, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CREAM;
      ctx.fillText(text, tx + 26, bandTop);
      tx += 26 + w + 30;
    }
  }

  if (matrix) {
    drawQr(ctx, matrix, qrX, qrY, qrBox);
    // What the square is for. Without it a code on a jar is just a square.
    ctx.font = `700 21px ${UI}`;
    ctx.fillStyle = MUTED;
    drawTracked(ctx, "SCAN FOR THIS VARIETY", qrX + qrBox / 2, qrY + qrBox + 34, 2.6, "center");
  }
}
