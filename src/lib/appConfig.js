// App-wide static constants. Location and strain data are now per-grow (stored
// in each grow's survey / generated plan - see src/lib/growProfile.js), so they
// no longer live here. What remains is genuinely app-wide configuration.

// Calendar month bounds (0-indexed: 4 = May, 9 = October).
// Tighten or widen when your grow season shifts.
export const GROW_MIN_MONTH = 4;
export const GROW_MAX_MONTH = 9;
