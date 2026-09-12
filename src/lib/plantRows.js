// Which plant a day-log row is about.
//
// Every per-plant row in the daily log (watering, training, health) carries the
// plant's NAME for display and its ID for linking, and the two have to be
// written together. A row that names a plant without its id only links back to
// that plant's own history by a fragile name match, and a row that names
// nothing at all belongs to no plant: it is not "all of them", it is
// unattributed, and nothing reads it back.
//
// Pure, so both the day log and its tests use the same rules.

/** The plant half of a row, from a roster entry. Null/undefined means unattributed. */
export function plantRef(plant) {
  const name = String(plant?.name ?? "").trim();
  if (!plant || (!name && !plant.id)) return { plant: "" };
  return plant.id ? { plant: name, plantId: plant.id } : { plant: name };
}

/** Re-point an existing row at another plant, dropping a stale id. */
export function withPlant(row, ref) {
  const next = { ...(row ?? {}), plant: ref?.plant ?? "" };
  if (ref?.plantId) next.plantId = ref.plantId;
  else delete next.plantId;
  return next;
}

/** One row per plant in the roster, each carrying the same fields. */
export function forEveryPlant(plants, fields) {
  return (plants ?? []).filter(Boolean).map((p) => ({ ...plantRef(p), ...fields }));
}

/** The roster entry a stored row refers to, by id first and name second. */
export function plantOfRow(row, plants = []) {
  if (row?.plantId) {
    const byId = plants.find((p) => p?.id === row.plantId);
    if (byId) return byId;
  }
  const name = String(row?.plant ?? "").trim().toLowerCase();
  if (!name) return null;
  return plants.find((p) => String(p?.name ?? "").trim().toLowerCase() === name) ?? null;
}
