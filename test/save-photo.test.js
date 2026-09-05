import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSharePhoto, dataUrlToBlob, loadSaveToRoll, photoFileFrom,
  rememberSaveToRoll, saveOutcomeMessage,
} from "../src/lib/savePhoto.js";

// Stand in for the browser bits this module reaches for.
function withGlobals({ nav, storage }, fn) {
  const hadNav = "navigator" in globalThis;
  const hadStore = "localStorage" in globalThis;
  const oldNav = globalThis.navigator;
  const oldStore = globalThis.localStorage;
  if (nav !== undefined) Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  if (storage !== undefined) Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  try { return fn(); }
  finally {
    if (nav !== undefined) {
      if (hadNav) Object.defineProperty(globalThis, "navigator", { value: oldNav, configurable: true, writable: true });
      else delete globalThis.navigator;
    }
    if (storage !== undefined) {
      if (hadStore) Object.defineProperty(globalThis, "localStorage", { value: oldStore, configurable: true, writable: true });
      else delete globalThis.localStorage;
    }
  }
}

const FILE = { name: "grow.jpg", type: "image/jpeg" };

// ── dataUrlToBlob ────────────────────────────────────────────────────────────
// The bug this replaces: fetch(dataUrl) is refused by the page's own
// `connect-src 'self'` policy, so every save failed before it began. Decoding
// here touches no network and no policy, so these tests matter.

// A real 1x1 PNG, the same one the app uses as a blank thumbnail.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA3fxvsgAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_B64}`;

test("a base64 data URL decodes to the exact bytes it encoded", async () => {
  const blob = dataUrlToBlob(PNG_URL);
  assert.equal(blob.type, "image/png");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes.length, 70);
  // The PNG signature, byte for byte.
  assert.deepEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual([...bytes], [...Buffer.from(PNG_B64, "base64")]);
});

test("decoding never reaches for the network", () => {
  // If it did, this would throw rather than return a blob.
  const noFetch = () => { throw new Error("fetch must not be called"); };
  const had = globalThis.fetch;
  globalThis.fetch = noFetch;
  try { assert.ok(dataUrlToBlob(PNG_URL).size > 0); }
  finally { globalThis.fetch = had; }
});

test("a plain, unencoded data URL works too", async () => {
  const blob = dataUrlToBlob("data:text/plain,hello%20there");
  assert.equal(await blob.text(), "hello there");
});

test("a data URL with no type stated is treated as a jpeg", () => {
  assert.equal(dataUrlToBlob("data:;base64,AAAA").type, "image/jpeg");
});

test("anything that is not a data URL is refused, not half-decoded", () => {
  for (const bad of ["", null, undefined, "https://example.com/a.jpg", "notadataurl", "data-image/png,x"]) {
    assert.throws(() => dataUrlToBlob(bad), /not a data URL/, `for ${JSON.stringify(bad)}`);
  }
});

test("photoFileFrom turns a stored photo into a named File the OS can take", async () => {
  const file = await photoFileFrom(PNG_URL, "grow-2026-09-05.jpg");
  assert.equal(file.name, "grow-2026-09-05.jpg");
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 70);
});

test("a File the camera already handed us is passed straight through", async () => {
  const original = new File([new Uint8Array([1, 2, 3])], "shot.jpg", { type: "image/jpeg" });
  assert.equal(await photoFileFrom(original, "ignored.jpg"), original);
});

// ── canSharePhoto ────────────────────────────────────────────────────────────
test("a phone that can take files is offered the share sheet", () => {
  withGlobals({ nav: { canShare: () => true, share: () => Promise.resolve() } }, () => {
    assert.equal(canSharePhoto(FILE), true);
  });
});

test("a desktop with no file sharing is not", () => {
  withGlobals({ nav: { canShare: () => false, share: () => Promise.resolve() } }, () => {
    assert.equal(canSharePhoto(FILE), false);
  });
  // Some browsers have share() for links but no canShare at all.
  withGlobals({ nav: { share: () => Promise.resolve() } }, () => {
    assert.equal(canSharePhoto(FILE), false);
  });
  withGlobals({ nav: {} }, () => assert.equal(canSharePhoto(FILE), false));
});

test("a browser whose canShare throws is treated as unable, not as a crash", () => {
  withGlobals({ nav: { canShare: () => { throw new TypeError("nope"); }, share: () => {} } }, () => {
    assert.equal(canSharePhoto(FILE), false);
  });
});

test("no file means nothing to share", () => {
  withGlobals({ nav: { canShare: () => true, share: () => {} } }, () => {
    assert.equal(canSharePhoto(null), false);
    assert.equal(canSharePhoto(undefined), false);
  });
});

// ── saveOutcomeMessage ───────────────────────────────────────────────────────
// The whole point: the failure modes are genuinely different, and lumping them
// into one "could not save" is what made this feel broken rather than fixable.

test("each outcome says what actually happened", () => {
  assert.match(saveOutcomeMessage("saving"), /save sheet/i);
  assert.match(saveOutcomeMessage("shared"), /photos/i);
  assert.match(saveOutcomeMessage("downloaded"), /download/i);
});

test("dismissing the sheet is not a failure and says nothing", () => {
  assert.equal(saveOutcomeMessage("cancelled"), "");
  assert.equal(saveOutcomeMessage(""), "");
  assert.equal(saveOutcomeMessage(undefined), "");
});

test("a lost tap tells you to tap again, because that is the actual fix", () => {
  const msg = saveOutcomeMessage("error", { name: "NotAllowedError" });
  assert.match(msg, /again/i);
  assert.doesNotMatch(msg, /could not save/i);
});

test("a browser that simply cannot do it says so, and how to get one that can", () => {
  for (const name of ["NotSupportedError", "TypeError"]) {
    const msg = saveOutcomeMessage("error", { name });
    assert.match(msg, /home screen/i, `for ${name}`);
  }
});

test("an unrecognised failure still gets a plain, honest sentence", () => {
  const msg = saveOutcomeMessage("error", { name: "SomethingElseError" });
  assert.match(msg, /could not save/i);
  assert.doesNotMatch(msg, /undefined/);
  // And a failure with no error object at all must not crash.
  assert.match(saveOutcomeMessage("error"), /could not save/i);
  assert.match(saveOutcomeMessage("error", null), /could not save/i);
});

test("every outcome produces a string, never undefined leaking to the screen", () => {
  for (const o of ["saving", "shared", "downloaded", "cancelled", "error", "", null, undefined, "nonsense"]) {
    assert.equal(typeof saveOutcomeMessage(o), "string", `for ${JSON.stringify(o)}`);
  }
});

// ── the preference ───────────────────────────────────────────────────────────
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map,
  };
}

test("saving to the roll is on until it is turned off", () => {
  withGlobals({ storage: fakeStorage() }, () => assert.equal(loadSaveToRoll(), true));
  withGlobals({ storage: fakeStorage({ savePhotosToRoll: "1" }) }, () => assert.equal(loadSaveToRoll(), true));
  withGlobals({ storage: fakeStorage({ savePhotosToRoll: "0" }) }, () => assert.equal(loadSaveToRoll(), false));
});

test("the choice round-trips", () => {
  const store = fakeStorage();
  withGlobals({ storage: store }, () => {
    rememberSaveToRoll(false);
    assert.equal(loadSaveToRoll(), false);
    rememberSaveToRoll(true);
    assert.equal(loadSaveToRoll(), true);
  });
});

test("a browser with storage blocked still defaults to saving, and never throws", () => {
  const blocked = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
  };
  withGlobals({ storage: blocked }, () => {
    assert.equal(loadSaveToRoll(), true);
    assert.doesNotThrow(() => rememberSaveToRoll(false));
  });
});
