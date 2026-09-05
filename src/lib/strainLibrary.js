// @ts-check
// Your strain library: every strain you have ever grown, in one place.
//
// The LIST is not stored anywhere. It is derived, every time, from the plants
// in your spaces, because that is the only place it can be right: rename a
// plant and the library follows, add a space and its strains appear. A stored
// list would drift the moment either happened.
//
// What IS stored (server side, one row per strain) is the part no grow can
// tell us: what you thought of it, how many stars you gave it, whether it is a
// favourite, and what the seed packet promised. Those rows are keyed by the
// lowercased name, so an opinion outlives the grow that earned it: delete the
// space and the rating is still there, waiting for the next time you run it.
//
// The two halves are joined here. A strain can come from either side alone:
// one you are growing now with nothing written about it yet, or one you rated
// two years ago whose space is long gone.

const NAME_MAX = 60;
export const NOTE_MAX = 4000;
export const MAX_RATING = 5;
// The range a seed packet can plausibly claim, matching the per-plant field.
export const FLOWER_WEEKS_MIN = 4;
export const FLOWER_WEEKS_MAX = 20;

export const STRAIN_TYPES = ["indica", "sativa", "hybrid"];
const TYPE_SET = new Set(STRAIN_TYPES);

/**
 * Pure: the identity of a strain.
 *
 * Lowercased with runs of whitespace collapsed, so "Blue  Dream", "blue dream"
 * and "Blue Dream " are one strain and not three. Shared with the worker (it
 * imports this function) so a row can never be filed under a key the client
 * would not look for.
 */
export function strainNameKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, NAME_MAX);
}

/** Pure: the name as it should be stored, trimmed and bounded. */
export function cleanStrainName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
}

/** Pure: a rating clamped to whole stars, 0 meaning unrated. */
export function normalizeRating(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_RATING, n));
}

/** Pure: weeks of flower as a seed packet would state it, or null. */
export function normalizeFlowerWeeks(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(FLOWER_WEEKS_MIN, Math.min(FLOWER_WEEKS_MAX, n));
}

// The value that appears most often, ties going to the first seen. Used to pick
// one answer out of several plants that may disagree about their own strain.
function commonest(values) {
  const counts = new Map();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

/**
 * Pure: the whole library, from the spaces and the saved rows.
 *
 * `grows` is what listGrows returns (each with its survey), `entries` is what
 * the strain library route returns. Neither is required: with no grows you get
 * exactly the strains you have written about, and with no rows you get exactly
 * the strains you have grown, unrated.
 *
 * Sorted so the strains in the ground right now come first, because that is
 * what you are most likely looking for, then alphabetically.
 */
export function buildStrainLibrary(grows, entries) {
  const byKey = new Map();

  const take = (key) => {
    let s = byKey.get(key);
    if (!s) {
      s = {
        key, name: "", plants: [], grows: [],
        growingNow: false, plantCount: 0, growCount: 0,
        firstGrown: null, lastGrown: null,
        rating: 0, note: "", favorite: false,
        type: null, photo: null, flowerWeeks: null,
        neverGrown: true,
      };
      byKey.set(key, s);
    }
    return s;
  };

  for (const grow of Array.isArray(grows) ? grows : []) {
    const plants = Array.isArray(grow?.survey?.strains) ? grow.survey.strains : [];
    // A plant with no date of its own belongs to the day its space began.
    const growStart = grow?.firstDate || (typeof grow?.createdAt === "string" ? grow.createdAt.slice(0, 10) : null);

    // One entry per strain PER SPACE, so "grown 3 times" counts spaces and not
    // the six plants that shared one of them.
    const perGrow = new Map();
    for (const plant of plants) {
      const key = strainNameKey(plant?.name);
      if (!key) continue;
      let g = perGrow.get(key);
      if (!g) {
        g = { growId: grow.id, growName: grow.displayName || "Untitled space", plants: 0, growing: 0, date: growStart };
        perGrow.set(key, g);
      }
      g.plants += 1;
      if (plant.status !== "harvested" && plant.status !== "dead") g.growing += 1;

      const s = take(key);
      s.neverGrown = false;
      s.plants.push(plant);
      s.plantCount += 1;
      const date = typeof plant.createdAt === "string" ? plant.createdAt.slice(0, 10) : growStart;
      if (date) {
        if (!s.firstGrown || date < s.firstGrown) s.firstGrown = date;
        if (!s.lastGrown || date > s.lastGrown) s.lastGrown = date;
      }
      // The spelling you used most recently is the one the library shows.
      if (!s.name || (date && s.lastGrown === date)) s.name = cleanStrainName(plant.name);
    }
    for (const [key, g] of perGrow) {
      const s = take(key);
      s.grows.push(g);
      s.growCount += 1;
      if (g.growing > 0) s.growingNow = true;
    }
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = strainNameKey(entry?.name);
    if (!key) continue;
    const s = take(key);
    s.rating = normalizeRating(entry.rating);
    s.note = typeof entry.note === "string" ? entry.note : "";
    s.favorite = Boolean(entry.favorite);
    // What you wrote down beats what the plants happen to say, because you
    // read it off the packet and they were typed in a hurry.
    if (TYPE_SET.has(entry.type)) s.type = entry.type;
    if (entry.photo === true || entry.photo === false) s.photo = entry.photo;
    const fw = normalizeFlowerWeeks(entry.flowerWeeks);
    if (fw != null) s.flowerWeeks = fw;
    if (!s.name) s.name = cleanStrainName(entry.name);
  }

  const list = [];
  for (const s of byKey.values()) {
    if (!s.name) continue;
    // Fill the blanks the saved row left from what the plants recorded.
    if (!s.type) s.type = commonest(s.plants.map((p) => p.type)) ?? "hybrid";
    if (s.photo == null) {
      const known = s.plants.map((p) => p.photo).filter((v) => v === true || v === false);
      s.photo = known.length ? known.some(Boolean) : null;
    }
    if (s.flowerWeeks == null) {
      s.flowerWeeks = normalizeFlowerWeeks(commonest(s.plants.map((p) => p.flowerWeeks)));
    }
    s.grows.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    delete s.plants;   // the caller wants counts, not the roster
    list.push(s);
  }

  return sortStrains(list);
}

/** Pure: growing now first, then by name. Never mutates the input. */
export function sortStrains(list) {
  return list.slice().sort((a, b) => {
    if (a.growingNow !== b.growingNow) return a.growingNow ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
}

export const STRAIN_FILTERS = [
  { value: "all",       label: "All" },
  { value: "growing",   label: "Growing now" },
  { value: "favorites", label: "Favourites" },
  { value: "rated",     label: "Rated" },
];

/**
 * Pure: the strains a search box and a filter chip leave behind.
 *
 * The search matches the name and the note, so "gave me a headache" finds the
 * strain you wrote that about even when you have forgotten which one it was.
 */
export function filterStrains(list, { query = "", filter = "all" } = {}) {
  const q = String(query).trim().toLowerCase();
  return (list ?? []).filter((s) => {
    if (filter === "growing" && !s.growingNow) return false;
    if (filter === "favorites" && !s.favorite) return false;
    if (filter === "rated" && !(s.rating > 0)) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.note ?? "").toLowerCase().includes(q);
  });
}

// ── Changing a strain ────────────────────────────────────────────────────────
//
// Renaming has to reach the plants. The library list is derived from them, so
// changing only the saved row would last exactly until the next render, when
// the old name reappeared out of the spaces. Same for deleting: a strain is
// "in" your library because a plant somewhere still carries its name.

/**
 * Pure: rename every plant of one strain within a single space.
 * Returns { survey, count } with count = how many plants were touched.
 * Never mutates the input.
 */
export function renameStrainInSurvey(survey, fromKey, toName) {
  const plants = Array.isArray(survey?.strains) ? survey.strains : [];
  const clean = cleanStrainName(toName);
  if (!fromKey || !clean) return { survey, count: 0 };
  let count = 0;
  const strains = plants.map((p) => {
    if (strainNameKey(p?.name) !== fromKey) return p;
    count += 1;
    return { ...p, name: clean };
  });
  return count ? { survey: { ...survey, strains }, count } : { survey, count: 0 };
}

/**
 * Pure: take every plant of one strain out of a single space.
 * Returns { survey, removedIds } so the caller can clean up what hung off them.
 */
export function removeStrainFromSurvey(survey, key) {
  const plants = Array.isArray(survey?.strains) ? survey.strains : [];
  if (!key) return { survey, removedIds: [] };
  const removedIds = [];
  const strains = plants.filter((p) => {
    if (strainNameKey(p?.name) !== key) return true;
    if (p?.id) removedIds.push(p.id);
    return false;
  });
  if (strains.length === plants.length) return { survey, removedIds: [] };
  return { survey: { ...survey, strains }, removedIds };
}

/**
 * Pure: fold a renamed strain's saved row into one that already exists under
 * the new name.
 *
 * Renaming onto a name you already have is almost always fixing a typo, so it
 * merges rather than refusing. The row you renamed ONTO is the established one
 * and keeps everything it has; the row you renamed only fills its blanks. Two
 * notes are kept, both of them, because a note is the one thing here that took
 * real effort to write and silently dropping half would be unforgivable.
 */
export function mergeStrainRows(target, source) {
  const t = target ?? {};
  const s = source ?? {};
  const notes = [t.note, s.note].map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean);
  return {
    name: t.name || s.name,
    note: [...new Set(notes)].join("\n\n"),
    rating: normalizeRating(t.rating) || normalizeRating(s.rating),
    favorite: Boolean(t.favorite || s.favorite),
    type: t.type ?? s.type ?? null,
    photo: t.photo === true || t.photo === false ? t.photo : (s.photo ?? null),
    flowerWeeks: normalizeFlowerWeeks(t.flowerWeeks) ?? normalizeFlowerWeeks(s.flowerWeeks),
  };
}

/**
 * Pure: what is true of the strain itself, whoever grows it. Blank parts are
 * dropped rather than shown as unknowns, so a strain nobody has told the app
 * anything about says nothing instead of "unknown, unknown, unknown".
 */
export function strainTraits(s) {
  const parts = [];
  if (s.type) parts.push(s.type.charAt(0).toUpperCase() + s.type.slice(1));
  if (s.photo === false) parts.push("Auto");
  if (s.flowerWeeks) parts.push(`${s.flowerWeeks}wk flower`);
  return parts.join(" · ");
}

/**
 * Pure: the one line under a strain's name in the list. Its traits, then how
 * much of it you have actually done. The strain's own page uses the traits
 * alone, because the history is spelled out in full further down.
 */
export function strainSummary(s) {
  const parts = [];
  const traits = strainTraits(s);
  if (traits) parts.push(traits);
  if (s.growCount === 1) parts.push("grown once");
  else if (s.growCount > 1) parts.push(`grown ${s.growCount} times`);
  else if (s.neverGrown) parts.push("not grown yet");
  return parts.join(" · ");
}
