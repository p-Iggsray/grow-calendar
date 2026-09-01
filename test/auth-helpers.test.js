import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateUsername,
  validatePassword,
  loginAttemptKey,
  retryAfterSeconds,
} from "../worker/auth.js";

// --- validateUsername --------------------------------------------------------

test("validateUsername accepts the canonical formats", () => {
  assert.equal(validateUsername("ab"), null);
  assert.equal(validateUsername("alice"), null);
  assert.equal(validateUsername("user_42"), null);
  assert.equal(validateUsername("a-b-c"), null);
  assert.equal(validateUsername("A".repeat(32)), null);
});

test("validateUsername rejects bad shapes", () => {
  assert.match(validateUsername(""), /username/);
  assert.match(validateUsername("a"), /2-32/);
  assert.match(validateUsername("A".repeat(33)), /2-32/);
  assert.match(validateUsername("has space"), /letters/);
  assert.match(validateUsername("punctuation!"), /letters/);
  assert.match(validateUsername(null), /username required/);
  assert.match(validateUsername(undefined), /username required/);
  assert.match(validateUsername(42), /username required/);
});

// --- validatePassword --------------------------------------------------------

test("validatePassword enforces the 8-char floor", () => {
  assert.equal(validatePassword("12345678"), null);
  assert.equal(validatePassword("a very long passphrase"), null);
  assert.match(validatePassword("short"), /at least 8/);
  assert.match(validatePassword(""), /at least 8/);
  assert.match(validatePassword(null), /password required/);
  assert.match(validatePassword(undefined), /password required/);
});

// --- loginAttemptKey ---------------------------------------------------------

test("loginAttemptKey lowercases the username so case differences share a counter", () => {
  assert.equal(loginAttemptKey("1.2.3.4", "Alice"), "1.2.3.4:alice");
  assert.equal(loginAttemptKey("1.2.3.4", "ALICE"), "1.2.3.4:alice");
  assert.equal(loginAttemptKey("1.2.3.4", "alice"), "1.2.3.4:alice");
});

test("loginAttemptKey separates by IP", () => {
  assert.notEqual(
    loginAttemptKey("1.2.3.4", "alice"),
    loginAttemptKey("5.6.7.8", "alice"),
  );
});

// --- retryAfterSeconds -------------------------------------------------------

test("retryAfterSeconds returns null when no lockout is set", () => {
  assert.equal(retryAfterSeconds(null, Date.now()), null);
  assert.equal(retryAfterSeconds(undefined, Date.now()), null);
  assert.equal(retryAfterSeconds("", Date.now()), null);
});

test("retryAfterSeconds returns null once the lockout has passed", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(retryAfterSeconds(past, Date.now()), null);
});

test("retryAfterSeconds rounds up the remaining seconds", () => {
  const now = Date.now();
  const future = new Date(now + 30_500).toISOString();
  assert.equal(retryAfterSeconds(future, now), 31);
});

test("retryAfterSeconds ignores garbage input safely", () => {
  assert.equal(retryAfterSeconds("not-a-date", Date.now()), null);
});
