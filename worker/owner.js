// @ts-check
import { error } from "./util.js";

// This is a single-person app. Exactly one kind of account may authenticate:
// an approved admin. Everything else - a leftover account, a stale session, a
// row someone managed to insert - is treated as a stranger.
//
// Admin is the marker because there is no longer any way to become one: signup
// is gone, and the route that could promote a user went with the admin panel.
// The only way to mint an owner now is a direct database write.
//
// Pure and unit-tested, and deliberately the ONLY definition of "me" in the
// codebase, so there is one place to change if the rule ever needs to.

/**
 * @param {{ role?: string, status?: string } | null | undefined} user
 * @returns {boolean}
 */
export function isOwner(user) {
  return !!user && user.role === "admin" && user.status === "approved";
}

/**
 * Route gate. Returns a Response to short-circuit with, or null when allowed.
 * 404 rather than 403: a stranger who somehow holds a session learns nothing
 * about what exists here.
 * @param {{ role?: string, status?: string } | null | undefined} user
 * @returns {Response | null}
 */
export function requireOwner(user) {
  return isOwner(user) ? null : error(404, "not found");
}
