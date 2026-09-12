import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planEviction, archiveFullness, formatBytes,
  ARCHIVE_MAX_SPACES, ARCHIVE_MAX_BYTES, ARCHIVE_CAPS,
} from "../src/lib/archive.js";

const space = (id, bytes) => ({ id, bytes });
const CAPS = { maxSpaces: 3, maxBytes: 1000 };

test("an archive with room drops nothing", () => {
  const archived = [space("a", 100), space("b", 100)];
  assert.deepEqual(planEviction(archived, space("new", 100), CAPS), []);
});

test("over the count cap, the space archived longest ago goes", () => {
  const archived = [space("oldest", 10), space("middle", 10), space("newest", 10)];
  assert.deepEqual(
    planEviction(archived, space("new", 10), CAPS).map((g) => g.id),
    ["oldest"],
  );
});

test("over the byte budget, it keeps dropping until it fits", () => {
  const archived = [space("a", 400), space("b", 400)];
  assert.deepEqual(
    planEviction(archived, space("new", 400), { maxSpaces: 99, maxBytes: 1000 }).map((g) => g.id),
    ["a"],
  );
  assert.deepEqual(
    planEviction(archived, space("huge", 900), { maxSpaces: 99, maxBytes: 1000 }).map((g) => g.id),
    ["a", "b"],
  );
});

test("whichever cap trips first decides", () => {
  // Well inside the byte budget, but one space too many: the count cap decides.
  const tiny = [space("a", 1), space("b", 1), space("c", 1)];
  assert.deepEqual(planEviction(tiny, space("new", 1), CAPS).map((g) => g.id), ["a"]);
  // Room in the count, but over the bytes: the budget decides instead.
  const fat = [space("a", 600), space("b", 300)];
  assert.deepEqual(planEviction(fat, space("new", 300), CAPS).map((g) => g.id), ["a"]);
});

test("a space bigger than the whole budget empties the archive and is still kept", () => {
  const archived = [space("a", 500), space("b", 500)];
  const evict = planEviction(archived, space("enormous", 5000), { maxSpaces: 99, maxBytes: 1000 });
  assert.deepEqual(evict.map((g) => g.id), ["a", "b"]);
  // The incoming space is never in the eviction list: refusing to keep the
  // thing just archived would be the one outcome nobody asked for.
  assert.ok(!evict.some((g) => g.id === "enormous"));
});

test("re-archiving a space already in the archive never evicts itself", () => {
  const archived = [space("a", 10), space("b", 10), space("c", 10)];
  assert.deepEqual(planEviction(archived, space("a", 10), CAPS), []);
});

test("an empty archive evicts nothing whatever the incoming size", () => {
  assert.deepEqual(planEviction([], space("new", 999999), CAPS), []);
  assert.deepEqual(planEviction(null, null, CAPS), []);
});

test("missing byte figures count as zero rather than poisoning the total", () => {
  const archived = [space("a", undefined), space("b", null)];
  assert.deepEqual(planEviction(archived, { id: "new" }, { maxSpaces: 99, maxBytes: 10 }), []);
});

test("archiveFullness reports both ceilings and the nearer one", () => {
  const f = archiveFullness([space("a", 500), space("b", 100)], CAPS);
  assert.equal(f.count, 2);
  assert.equal(f.bytes, 600);
  assert.equal(f.maxSpaces, 3);
  assert.equal(f.maxBytes, 1000);
  // 2 of 3 spaces (0.667) is nearer its ceiling than 600 of 1000 bytes (0.6).
  assert.equal(Math.round(f.fraction * 1000) / 1000, 0.667);
});

test("archiveFullness of an empty archive is empty, not NaN", () => {
  assert.deepEqual(archiveFullness([], CAPS), { count: 0, bytes: 0, maxSpaces: 3, maxBytes: 1000, fraction: 0 });
  assert.equal(archiveFullness(null, CAPS).fraction, 0);
});

test("the shipped caps are real numbers", () => {
  assert.ok(Number.isFinite(ARCHIVE_MAX_SPACES) && ARCHIVE_MAX_SPACES > 0);
  assert.ok(Number.isFinite(ARCHIVE_MAX_BYTES) && ARCHIVE_MAX_BYTES > 0);
  assert.deepEqual(ARCHIVE_CAPS, { maxSpaces: ARCHIVE_MAX_SPACES, maxBytes: ARCHIVE_MAX_BYTES });
});

test("formatBytes reads the way a person would say it", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(900), "900 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(1.5 * 1024 ** 2), "1.5 MB");
  assert.equal(formatBytes(12 * 1024 ** 3), "12 GB");
  assert.equal(formatBytes(null), "0 B");
});
