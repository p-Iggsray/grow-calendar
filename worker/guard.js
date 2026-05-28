// @ts-check
import { error } from "./util.js";

/**
 * @typedef {Object} SessionUser
 * @property {number} id
 * @property {string} username
 * @property {"admin" | "user"} role
 * @property {"approved" | "pending"} status
 * @property {string} [rotateTo]   set by currentUser when a sliding rotation issues a new token
 */

/** @param {SessionUser | null | undefined} user */
export function isApproved(user) {
  return !!user && user.status === "approved";
}

/** @param {SessionUser | null | undefined} user */
export function isAdmin(user) {
  return !!user && user.role === "admin";
}

/**
 * Returns a Response to short-circuit with, or null when allowed.
 * @param {SessionUser | null | undefined} user
 * @returns {Response | null}
 */
export function requireApproved(user) {
  return isApproved(user) ? null : error(403, "pending approval");
}

/**
 * @param {SessionUser | null | undefined} user
 * @returns {Response | null}
 */
export function requireAdmin(user) {
  return isAdmin(user) ? null : error(403, "admin only");
}
