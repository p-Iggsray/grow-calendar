import { test } from "node:test";
import assert from "node:assert/strict";
import { qrMatrix, byteCapacity } from "../src/lib/qr.js";

// The encoder was verified against a real decoder (jsQR) while it was written:
// every version 1-10 at its exact byte capacity, every one of the eight masks,
// plus multi-byte UTF-8 - 84 codes, all of which scanned. That decoder is a
// throwaway tool rather than a dependency of this app, so what is pinned here
// is everything that can be checked without one: the published format strings,
// the fixed patterns a scanner locks onto, the capacities, and a fingerprint of
// a known matrix so a refactor cannot quietly change the output.
//
// Two bugs found that way are worth naming, because both produced a code that
// looked perfect and scanned as nothing: a generator polynomial built in
// reverse degree order, and format bits placed least-significant-first.

// Level M, masks 0-7, from ISO/IEC 18004 Table C.1.
const FORMAT_M = [
  "101010000010010", "101000100100101", "101111001111100", "101101101001011",
  "100010111111001", "100000011001110", "100111110010111", "100101010100000",
];

// The format modules of the first copy, in the order the spec places them.
function formatCopy1(m) {
  const at = [];
  for (let i = 0; i <= 5; i++) at.push([8, i]);
  at.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i <= 14; i++) at.push([14 - i, 8]);
  return at.map(([r, c]) => (m.modules[r][c] ? "1" : "0")).join("");
}

test("each mask writes its published format string", () => {
  for (let mask = 0; mask < 8; mask++) {
    const m = qrMatrix("Blue Dream", mask);
    assert.equal(formatCopy1(m), FORMAT_M[mask], `mask ${mask}`);
  }
});

test("both copies of the format information agree", () => {
  const m = qrMatrix("Blue Dream", 4);
  const n = m.size;
  const copy2 = [];
  for (let i = 0; i < 8; i++) copy2.push(m.modules[8][n - 1 - i] ? "1" : "0");
  for (let i = 8; i < 15; i++) copy2.push(m.modules[n - 15 + i][8] ? "1" : "0");
  assert.equal(copy2.join(""), formatCopy1(m));
});

test("the three finder patterns are where a scanner looks for them", () => {
  const m = qrMatrix("Blue Dream");
  const n = m.size;
  const ring = (top, left) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const onRing = r === 0 || r === 6 || c === 0 || c === 6;
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        assert.equal(m.modules[top + r][left + c], onRing || inCore, `finder ${top},${left} at ${r},${c}`);
      }
    }
  };
  ring(0, 0);
  ring(0, n - 7);
  ring(n - 7, 0);
});

test("the timing patterns alternate all the way across", () => {
  const m = qrMatrix("Blue Dream");
  for (let i = 8; i < m.size - 8; i++) {
    assert.equal(m.modules[6][i], i % 2 === 0, `row timing at ${i}`);
    assert.equal(m.modules[i][6], i % 2 === 0, `column timing at ${i}`);
  }
});

test("the module that is always dark, is", () => {
  const m = qrMatrix("Blue Dream");
  assert.equal(m.modules[m.size - 8][8], true);
});

test("versions are chosen by capacity, and the size follows the version", () => {
  assert.equal(qrMatrix("A").version, 1);
  assert.equal(qrMatrix("A").size, 21);
  assert.equal(qrMatrix("G".repeat(byteCapacity(1))).version, 1);
  assert.equal(qrMatrix("G".repeat(byteCapacity(1) + 1)).version, 2);
  assert.equal(qrMatrix("G".repeat(byteCapacity(10))).version, 10);
  assert.equal(qrMatrix("G".repeat(byteCapacity(10))).size, 57);
});

test("capacities are the level-M byte capacities, and rise with version", () => {
  assert.equal(byteCapacity(1), 14);
  assert.equal(byteCapacity(10), 213);
  for (let v = 2; v <= 10; v++) assert.ok(byteCapacity(v) > byteCapacity(v - 1), `v${v}`);
});

test("text too long for version 10 is refused rather than truncated", () => {
  assert.equal(qrMatrix("x".repeat(byteCapacity(10) + 1)), null);
  assert.equal(qrMatrix("x".repeat(4000)), null);
});

test("multi-byte characters are counted as bytes, not characters", () => {
  // Three-byte characters each, so this is 21 bytes and cannot fit version 1.
  const seven = "日本語のテスト";
  assert.equal(seven.length, 7);
  assert.ok(qrMatrix(seven).version > 1);
});

test("a known input keeps producing a known matrix", () => {
  // A fingerprint, so a refactor that changes the output has to be deliberate.
  // This exact matrix was confirmed to scan as the string below.
  const m = qrMatrix("https://grow.example.com/?strain=Blue%20Dream", 4);
  let dark = 0;
  let hash = 0;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (!m.modules[r][c]) continue;
      dark++;
      hash = (hash * 31 + r * m.size + c) >>> 0;
    }
  }
  assert.equal(m.version, 4);
  assert.equal(m.size, 33);
  assert.equal(dark, 548);
  assert.equal(hash, 1484505667);
});

test("empty text still produces a valid, scannable-shaped matrix", () => {
  const m = qrMatrix("");
  assert.equal(m.version, 1);
  assert.equal(m.size, 21);
  assert.equal(m.modules[0][0], true);
});
