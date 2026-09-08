// A QR code, drawn without a library.
//
// The label needs a scannable code and nothing else in the app does, so this is
// the smallest encoder that produces a real one: byte mode, error correction
// level M, versions 1 through 10. That reaches 216 bytes, which is far more
// than a link to a strain will ever need, and level M survives the speckle a
// thermal head leaves on cheap stock.
//
// It is the full specification for that subset, not an approximation - Reed-
// Solomon over GF(256), all eight data masks scored by the standard penalty
// rules, and BCH-coded format bits - because a code that is nearly right is a
// code that does not scan, and you would only find out at the printer.
//
// Pure: it returns a square matrix of booleans and never touches a canvas, so
// the encoding is tested directly and the drawing is somebody else's problem.

// ── Galois field GF(256), primitive polynomial 0x11D ────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// The generator polynomial for `n` error-correction codewords: the product of
// (x - a^i) for i below n. Coefficients run highest degree first, so it stays
// monic and the division below actually cancels its leading term.
function generatorPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                       // multiply by x
      next[j + 1] ^= mul(poly[j], EXP[i]);      // and by a^i
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data, count) {
  const gen = generatorPoly(count);
  const res = new Array(data.length + count).fill(0);
  for (let i = 0; i < data.length; i++) res[i] = data[i];
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], factor);
  }
  return res.slice(data.length);
}

// ── Version tables, error correction level M only ───────────────────────────
// [ec codewords per block, blocks in group 1, data codewords each,
//  blocks in group 2, data codewords each]
const BLOCKS_M = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];
const ALIGN = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];
const MAX_VERSION = 10;

function dataCapacity(version) {
  const [, g1, d1, g2, d2] = BLOCKS_M[version];
  return g1 * d1 + g2 * d2;
}

/** How many bytes of payload a version holds in byte mode. */
export function byteCapacity(version) {
  const countBits = version < 10 ? 8 : 16;
  // 4 mode bits + the character count, then whole bytes.
  return Math.floor((dataCapacity(version) * 8 - 4 - countBits) / 8);
}

function pickVersion(byteLen) {
  for (let v = 1; v <= MAX_VERSION; v++) if (byteCapacity(v) >= byteLen) return v;
  return null;
}

// ── Bit stream ──────────────────────────────────────────────────────────────
function bitStream() {
  const bits = [];
  return {
    push(value, len) { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); },
    bits,
  };
}

function encodeData(bytes, version) {
  const total = dataCapacity(version);
  const bs = bitStream();
  bs.push(0b0100, 4);                              // byte mode
  bs.push(bytes.length, version < 10 ? 8 : 16);    // character count
  for (const b of bytes) bs.push(b, 8);
  // Terminator, then pad to a byte boundary, then the fixed pad pattern.
  const capacityBits = total * 8;
  for (let i = 0; i < 4 && bs.bits.length < capacityBits; i++) bs.bits.push(0);
  while (bs.bits.length % 8 !== 0) bs.bits.push(0);
  const out = [];
  for (let i = 0; i < bs.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bs.bits[i + j];
    out.push(byte);
  }
  const PAD = [0xec, 0x11];
  for (let i = 0; out.length < total; i++) out.push(PAD[i % 2]);
  return out;
}

// Split into blocks, add error correction, then interleave both - which is what
// lets a scanner lose a whole corner and still read the thing.
function interleave(data, version) {
  const [ecLen, g1, d1, g2, d2] = BLOCKS_M[version];
  const blocks = [];
  let at = 0;
  for (let i = 0; i < g1; i++) { blocks.push(data.slice(at, at + d1)); at += d1; }
  for (let i = 0; i < g2; i++) { blocks.push(data.slice(at, at + d2)); at += d2; }
  const ecBlocks = blocks.map((b) => ecCodewords(b, ecLen));

  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ── Matrix ──────────────────────────────────────────────────────────────────
function newMatrix(size) {
  return { size, m: Array.from({ length: size }, () => new Array(size).fill(null)) };
}

function placeFinder(mx, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || cc < 0 || rr >= mx.size || cc >= mx.size) continue;
      const onRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
        || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      mx.m[rr][cc] = onRing || inCore;
    }
  }
}

function placeFunctionPatterns(mx, version) {
  const n = mx.size;
  placeFinder(mx, 0, 0);
  placeFinder(mx, 0, n - 7);
  placeFinder(mx, n - 7, 0);
  // Timing patterns.
  for (let i = 8; i < n - 8; i++) {
    mx.m[6][i] = i % 2 === 0;
    mx.m[i][6] = i % 2 === 0;
  }
  // Alignment patterns, skipping the three that would sit on a finder.
  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          mx.m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }
  // The always-dark module.
  mx.m[n - 8][8] = true;
  // Reserve the format areas so data placement skips them.
  for (let i = 0; i < 9; i++) {
    if (mx.m[8][i] === null) mx.m[8][i] = false;
    if (mx.m[i][8] === null) mx.m[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (mx.m[8][n - 1 - i] === null) mx.m[8][n - 1 - i] = false;
    if (mx.m[n - 1 - i][8] === null) mx.m[n - 1 - i][8] = false;
  }
  // Version information, from version 7 up.
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      mx.m[Math.floor(i / 3)][n - 11 + (i % 3)] = bit;
      mx.m[n - 11 + (i % 3)][Math.floor(i / 3)] = bit;
    }
  }
}

function versionBits(version) {
  let d = version << 12;
  for (let i = 0; i < 6; i++) if (d & (1 << (17 - i))) d ^= 0b1111100100101 << (5 - i);
  return (version << 12) | d;
}

function formatBits(mask) {
  // Level M is 00, so the five data bits are just the mask.
  const data = (0b00 << 3) | mask;
  let d = data << 10;
  for (let i = 0; i < 5; i++) if (d & (1 << (14 - i))) d ^= 0b10100110111 << (4 - i);
  return ((data << 10) | d) ^ 0b101010000010010;
}

function placeFormat(mx, mask) {
  const n = mx.size;
  const bits = formatBits(mask);
  // The placement below walks the modules in the spec's order, which runs from
  // the most significant bit of the format value down. Reading them the other
  // way round writes a perfectly valid format string backwards, and the code
  // then fails to scan while looking entirely correct.
  const at = (i) => ((bits >> (14 - i)) & 1) === 1;
  for (let i = 0; i <= 5; i++) mx.m[8][i] = at(i);
  mx.m[8][7] = at(6);
  mx.m[8][8] = at(7);
  mx.m[7][8] = at(8);
  for (let i = 9; i <= 14; i++) mx.m[14 - i][8] = at(i);
  // The second copy runs the other way about: its low bits go along row 8 from
  // the right edge, its high bits up column 8 from the bottom. Swapping the two
  // halves still scans, because a reader takes the first copy it can, so this
  // one is only ever wrong on the codes where the first copy is damaged.
  for (let i = 0; i <= 7; i++) mx.m[8][n - 1 - i] = at(i);
  for (let i = 8; i <= 14; i++) mx.m[n - 15 + i][8] = at(i);
}

// The zigzag: two columns at a time, right to left, skipping the timing column.
function placeData(mx, codewords, reserved) {
  const n = mx.size;
  let bitIndex = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const row = upward ? n - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (reserved[row][col]) continue;
        const byte = codewords[bitIndex >> 3];
        const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
        mx.m[row][col] = bit === 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// The four penalty rules. Lowest total wins, which is what keeps large blank
// areas and finder-lookalikes out of the data.
function penalty(m, n) {
  let score = 0;
  const runScore = (line) => {
    let run = 1, s = 0;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) s += 3 + (run - 5);
    return s;
  };
  for (let r = 0; r < n; r++) score += runScore(m[r]);
  for (let c = 0; c < n; c++) score += runScore(m.map((row) => row[c]));

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const hasAt = (get, i) =>
    A.every((v, k) => get(i + k) === v) || B.every((v, k) => get(i + k) === v);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c + 10 < n; c++) if (hasAt((i) => m[r][i], c)) score += 40;
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r + 10 < n; r++) if (hasAt((i) => m[i][c], r)) score += 40;
  }

  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * Encode text as a QR matrix.
 *
 * Returns { size, modules } where modules[row][col] is true for a dark cell,
 * or null when the text is longer than version 10 at level M can carry.
 */
export function qrMatrix(text, forceMask = null) {
  const bytes = [...new TextEncoder().encode(String(text ?? ""))];
  const version = pickVersion(bytes.length);
  if (!version) return null;

  const codewords = interleave(encodeData(bytes, version), version);
  const size = 17 + version * 4;

  // Which cells belong to the function patterns, so data skips them.
  const probe = newMatrix(size);
  placeFunctionPatterns(probe, version);
  const reserved = probe.m.map((row) => row.map((v) => v !== null));

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask != null && mask !== forceMask) continue;
    const mx = newMatrix(size);
    placeFunctionPatterns(mx, version);
    placeData(mx, codewords, reserved);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && MASKS[mask](r, c)) mx.m[r][c] = !mx.m[r][c];
      }
    }
    placeFormat(mx, mask);
    const grid = mx.m.map((row) => row.map((v) => v === true));
    const score = penalty(grid, size);
    if (!best || score < best.score) best = { score, grid };
  }
  return { size, modules: best.grid, version };
}
