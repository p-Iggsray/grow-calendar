// The grow every eval case is asked about.
//
// A suite that ran against real data would change its answers every time the
// grower logged something, so "did she find the mites" would pass or fail for
// reasons that have nothing to do with MJ. This is a fixed, known space: the
// dates below are the correct answers, and they only move when this file does.
//
// It is a fake D1 rather than a real one so the suite needs no database, and a
// deliberately small one: every query MJ's read tools actually make, and
// nothing else.

export const TODAY = "2026-09-15";

export const GROW_ID = "evalgrow";

export const PLANTS = [
  { id: "p1", name: "Blue Dream", type: "sativa", stage: "flowering", status: "growing", flowerWeeks: 9, photo: true },
  { id: "p2", name: "Gelato", type: "indica", stage: "flowering", status: "growing", flowerWeeks: 8, photo: true },
];

export const SURVEY = {
  crop: "cannabis",
  environment: "indoor",
  envSize: "4x4 tent",
  lightSchedule: "12/12",
  medium: "coco",
  containerType: "fabric",
  containerGallons: 5,
  location: "Athens, OH",
  lat: 39.33, lon: -82.1,
  strains: PLANTS,
};

// Day 0 is 2026-06-01, so 2026-09-15 is day 106.
export const FIRST_DATE = "2026-06-01";
export const STAGE_EVENTS = [
  { date: "2026-06-01", stage: "seedling", plantId: "p1" },
  { date: "2026-06-20", stage: "vegetative", plantId: "p1" },
  { date: "2026-07-25", stage: "flowering", plantId: "p1" },
];

// The one day that mentions mites. "When did I last see mites" has exactly one
// right answer and it is this.
export const MITE_DATE = "2026-08-02";

export const DAY_NOTES = [
  { date: "2026-08-02", body: "Found spider mites on the lower fan leaves of Blue Dream. Sprayed and will check in two days." },
  { date: "2026-08-04", body: "Checked the undersides again, nothing moving. Looks like I caught it early." },
  { date: "2026-09-14", body: "Buds are stacking well. Smell has gone properly sharp this week." },
];

export const GROW_LOG = [
  {
    date: "2026-09-14", water_gal: 2.5, feed: "Jack's 321", temp_high: 78, temp_low: 68, humidity: 52,
    water_plants: JSON.stringify([
      { plant: "Blue Dream", plantId: "p1", amount: 5, unit: "l", gal: 1.32 },
      { plant: "Gelato", plantId: "p2", amount: 5, unit: "l", gal: 1.32 },
    ]),
    training: JSON.stringify([]), plant_health: JSON.stringify([]),
  },
  {
    date: "2026-09-10", water_gal: 2.64, feed: null, temp_high: 80, temp_low: 69, humidity: 55,
    water_plants: JSON.stringify([
      { plant: "Blue Dream", plantId: "p1", amount: 5, unit: "l", gal: 1.32 },
      { plant: "Gelato", plantId: "p2", amount: 5, unit: "l", gal: 1.32 },
    ]),
    training: JSON.stringify([]), plant_health: JSON.stringify([]),
  },
];

export const PLANT_LOG = [
  { plant_id: "p1", date: "2026-08-02", kind: "health", detail: null, body: "Spider mites found, treated.", height: null, height_unit: null, health: "stressed" },
  { plant_id: "p1", date: "2026-09-12", kind: "note", detail: null, body: "Trichomes mostly cloudy, a few amber starting.", height: null, height_unit: null, health: "healthy" },
];

// Two photographs a fortnight apart, so a "how has she changed" question has
// something real to compare. The payload is a valid JPEG data URL of no
// particular content; what the eval checks is that she FETCHES them.
const PIXEL = `data:image/jpeg;base64,${"/9j/4AAQSkZJRgABAQEAYABgAAD".repeat(20)}`;
export const PHOTOS = [
  { id: "ph1", date: "2026-08-30", thumb: PIXEL, data: PIXEL, plant_id: "p1", from_camera: 1 },
  { id: "ph2", date: "2026-09-13", thumb: PIXEL, data: PIXEL, plant_id: "p1", from_camera: 1 },
];

export const TIMELINE = { events: STAGE_EVENTS, firstDate: FIRST_DATE };

export const RAW_GROW = {
  id: GROW_ID,
  displayName: "Flower Tent",
  status: "active",
  survey: SURVEY,
  lifecycle: null,
  needsSetup: false,
  archivedAt: null,
};

/**
 * A D1 stand-in that answers the queries MJ's read tools make.
 *
 * Writes are accepted and recorded rather than applied: a case that expects a
 * confirmation before writing needs the write to be observable, and a case
 * that expects no write needs it to be caught.
 */
export function evalDb() {
  const writes = [];
  const match = (sql, re) => re.test(sql);

  return {
    writes,
    DB: {
      prepare(sql) {
        const stmt = {
          sql,
          args: [],
          bind(...a) { stmt.args = a; return stmt; },
          async first() {
            if (match(sql, /FROM grows WHERE id/)) {
              return { id: GROW_ID, survey: JSON.stringify(SURVEY), display_name: "Flower Tent", status: "active", lifecycle: null };
            }
            if (match(sql, /COUNT\(\*\) AS n FROM journal_photos/)) return { n: PHOTOS.length };
            if (match(sql, /FROM journal_photos WHERE id = \?/)) {
              return PHOTOS.find((p) => p.id === stmt.args[0]) ?? null;
            }
            if (match(sql, /FROM day_notes WHERE/) && match(sql, /date = \?/)) {
              const d = DAY_NOTES.find((n) => n.date === stmt.args[2]);
              return d ? { body: d.body } : null;
            }
            if (match(sql, /FROM grow_log WHERE/) && match(sql, /date = \?/)) {
              return GROW_LOG.find((r) => r.date === stmt.args[2]) ?? null;
            }
            if (match(sql, /SUM\(water_gal\)/)) {
              return { total_water: 5.14, log_days: GROW_LOG.length, feed_days: 1 };
            }
            if (match(sql, /COUNT\(\*\) AS samples/)) return { samples: 0 };
            return null;
          },
          async all() {
            if (match(sql, /FROM journal_photos/)) return { results: PHOTOS };
            if (match(sql, /FROM day_notes/)) return { results: DAY_NOTES };
            if (match(sql, /FROM plant_log/)) return { results: PLANT_LOG };
            if (match(sql, /FROM grow_log/)) return { results: GROW_LOG };
            if (match(sql, /FROM grow_events/)) return { results: [] };
            if (match(sql, /FROM env_readings/)) return { results: [] };
            if (match(sql, /FROM grows/)) {
              return { results: [{ id: GROW_ID, display_name: "Flower Tent", status: "active", survey: JSON.stringify(SURVEY), archived_at: null, created_at: `${FIRST_DATE}T00:00:00Z` }] };
            }
            return { results: [] };
          },
          async run() {
            if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push({ sql: sql.trim().slice(0, 60), args: stmt.args });
            return { meta: { changes: 1, last_row_id: 1 } };
          },
        };
        return stmt;
      },
      async batch(stmts) { return stmts.map(() => ({})); },
    },
  };
}
