import { test } from "node:test";
import assert from "node:assert/strict";
import { correctWord, wordBeforeBoundary } from "../src/lib/autocorrect.js";

test("grow words the keyboard misses are fixed", () => {
  assert.deepEqual(correctWord("tricomes"), { replace: "trichomes" });
  assert.deepEqual(correctWord("humidty"), { replace: "humidity" });
  assert.deepEqual(correctWord("mycellium"), { replace: "mycelium" });
});

test("the case it was typed in is kept", () => {
  assert.deepEqual(correctWord("Tricomes"), { replace: "Trichomes" });
  assert.deepEqual(correctWord("HUMIDTY"), { replace: "HUMIDITY" });
  assert.deepEqual(correctWord("teh"), { replace: "the" });
});

test("a lone i and the missing apostrophes", () => {
  assert.deepEqual(correctWord("i"), { replace: "I" });
  assert.equal(correctWord("I"), null);
  assert.deepEqual(correctWord("dont"), { replace: "don't" });
  assert.deepEqual(correctWord("im"), { replace: "I'm" });
});

test("correct words, real words and odd tokens are left alone", () => {
  for (const w of ["trichomes", "humidity", "wont", "cant", "ill", "id", "lets", "3rd", ""]) {
    assert.equal(correctWord(w), null, w);
  }
});

test("a doubled small word is dropped, real doubles are not", () => {
  assert.deepEqual(correctWord("the", "the"), { dropDouble: true });
  assert.deepEqual(correctWord("The", "the"), { dropDouble: true });
  assert.equal(correctWord("had", "had"), null);
  assert.equal(correctWord("that", "that"), null);
});

test("the finished word is found just before the character that ended it", () => {
  const text = "Checked the tricomes ";
  const found = wordBeforeBoundary(text, text.length);
  assert.equal(found.word, "tricomes");
  assert.equal(found.start, 12);
  assert.equal(found.previousWord, "the");
  assert.equal(wordBeforeBoundary("tricomes", 8), null, "no boundary typed yet");
});

test("words glued to URLs, numbers or paths are not words", () => {
  assert.equal(wordBeforeBoundary("see example.com/teh ", 20), null);
  assert.equal(wordBeforeBoundary("x2teh ", 6), null);
});

test("a doubled word reports where the gap before it starts", () => {
  const text = "fed the  the ";
  const found = wordBeforeBoundary(text, text.length);
  assert.equal(found.previousWord, "the");
  assert.equal(text.slice(found.previousEnd, found.end), "  the");
});
