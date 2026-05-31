// App-wide static constants. Sub-project B (#92) will move location and strain
// data into per-user plan data; until then this is the single source of truth,
// shared by the worker (MJ persona) and the React app (header, login, calendar).
export const LOCATION = "Athens, Ohio";

// Strain names — update here if you change what you're growing next season.
export const STRAIN_1 = "Grandaddy Purp";
export const STRAIN_2 = "Strawberry Haze";

// Calendar month bounds (0-indexed: 4 = May, 9 = October).
// Tighten or widen when your grow season shifts.
export const GROW_MIN_MONTH = 4;
export const GROW_MAX_MONTH = 9;
