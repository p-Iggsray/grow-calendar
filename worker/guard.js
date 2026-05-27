import { error } from "./util.js";

export function isApproved(user) {
  return !!user && user.status === "approved";
}

export function isAdmin(user) {
  return !!user && user.role === "admin";
}

// Returns a Response to short-circuit with, or null when allowed.
export function requireApproved(user) {
  return isApproved(user) ? null : error(403, "pending approval");
}

export function requireAdmin(user) {
  return isAdmin(user) ? null : error(403, "admin only");
}
