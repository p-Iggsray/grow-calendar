// @ts-check
// Picking the handful of photos that show what a strain actually looked like.
//
// A strain you have grown three times might have two hundred photos behind it.
// Nobody wants two hundred; what tells the story is a few pictures spread
// across the life of the plant. So: one per stage it was photographed in,
// oldest to newest, which reads as a growth sequence rather than a gallery.
//
// The stage a photo belongs to is not stored on the photo. It is worked out
// from the plant's own stage history: the last switch recorded on or before
// the day the photo was taken. Plants whose stages were never logged still get
// photos, spread across time instead, because a strain with pictures and no
// stage log should not come out looking like a strain with no pictures.
import { STAGE_ORDER } from "./stageTimeline.js";

const STAGE_RANK = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]));

/**
 * Pure: the stage in force on `date`, from a plant's stage history sorted
 * oldest first. Null before the first recorded switch, because the app has no
 * idea what the plant was doing before it was told.
 */
export function stageOn(history, date) {
  if (!Array.isArray(history) || !date) return null;
  let stage = null;
  for (const record of history) {
    if (!record?.date || record.date > date) break;
    if (record.stage) stage = record.stage;
  }
  return stage;
}

// Pure: `n` items spread evenly across a list, always including the first and
// the last. Picking the newest n would show a week of flower and nothing else.
export function spread(list, n) {
  if (n <= 0 || list.length === 0) return [];
  if (list.length <= n) return list.slice();
  if (n === 1) return [list[list.length - 1]];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  }
  return out;
}

/**
 * Pure: the photos worth showing for one strain, oldest first.
 *
 * `photos` are every photo of every plant of this strain, in any order;
 * `historyByPlant` maps a plant id to its stage history, oldest first. Takes
 * the newest photo from each stage, then fills any remaining room with a
 * spread of the photos whose stage could not be worked out.
 */
export function pickStrainPhotos(photos, historyByPlant = {}, max = 8) {
  const byStage = new Map();
  const unstaged = [];

  for (const p of photos ?? []) {
    if (!p?.id || !p.date) continue;
    const stage = stageOn(historyByPlant[p.plantId], p.date);
    if (!stage) { unstaged.push({ ...p, stage: null }); continue; }
    const cur = byStage.get(stage);
    // The newest picture of a stage shows the most of it.
    if (!cur || p.date > cur.date) byStage.set(stage, { ...p, stage });
  }

  const staged = STAGE_ORDER.filter((s) => byStage.has(s)).map((s) => byStage.get(s));
  const picked = staged.slice(0, max);
  if (picked.length < max) {
    unstaged.sort(byDate);
    picked.push(...spread(unstaged, max - picked.length));
  }
  picked.sort(byDate);
  return picked;
}

function byDate(a, b) {
  return String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));
}

/**
 * Pure: the one photo that should represent a strain in a list.
 *
 * The furthest-along stage wins, because a fat flowering shot says "Gelato"
 * and a seedling in a solo cup says nothing at all. Falls back to the most
 * recent picture when no stage is known.
 */
export function coverPhoto(picked) {
  if (!picked?.length) return null;
  let best = null;
  for (const p of picked) {
    if (!best) { best = p; continue; }
    const rank = STAGE_RANK[p.stage] ?? -1;
    const bestRank = STAGE_RANK[best.stage] ?? -1;
    if (rank > bestRank || (rank === bestRank && byDate(best, p) < 0)) best = p;
  }
  return best;
}

/** The URL an <img> loads a stored photo from, at either size. */
export function photoUrl(id, size = "thumb") {
  return `/api/photos/${encodeURIComponent(id)}/${size === "full" ? "full" : "thumb"}`;
}
