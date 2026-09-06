import { cropOf } from "../../lib/crops.js";

// ─── Supply checklist ───────────────────────────────────────────────────────

// What a grower needs on hand, per crop. A monotub and a flower tent share
// almost nothing here: one wants grain spawn and a still air box, the other
// wants bloom nutrients and a trellis.
const CANNABIS_SUPPLIES = [
  { id: "soil",        label: "Potting mix / growing medium",   example: "e.g. Fox Farm Happy Frog, coco coir" },
  { id: "perlite",     label: "Perlite or drainage amendment",  example: "" },
  { id: "containers",  label: "Containers / fabric pots",       example: "e.g. 5-gal or 7-gal fabric pots" },
  { id: "calmag",      label: "Cal-Mag supplement",             example: "e.g. Botanicare Cal-Mag Plus" },
  { id: "veg_nutes",   label: "Veg / grow nutrients",           example: "e.g. Fox Farm Grow Big, General Hydroponics Micro" },
  { id: "bloom_nutes", label: "Bloom / flower nutrients",       example: "e.g. Fox Farm Tiger Bloom, Flora Bloom" },
  { id: "bloom_boost", label: "Bloom booster",                  example: "e.g. Fox Farm Big Bloom, Bud Candy" },
  { id: "ph_kit",      label: "pH test kit or digital pH meter",example: "" },
  { id: "tds_meter",   label: "TDS / EC meter",                 example: "" },
  { id: "support",     label: "Stakes, trellis, or SCROG net",  example: "" },
  { id: "ties",        label: "Plant ties or velcro tape",       example: "" },
  { id: "watering",    label: "Watering can or irrigation",     example: "" },
  { id: "loupe",       label: "Jeweler's loupe (trichome check)",example: "10x or 60x" },
  { id: "humidity",    label: "Hygrometer (humidity meter)",     example: "" },
  { id: "drying",      label: "Drying space",                   example: "dark room, 60 to 70 F, 55 to 65 percent RH" },
  { id: "jars",        label: "Mason jars for curing",          example: "" },
  { id: "neem",        label: "Pest preventative",              example: "e.g. neem oil, insecticidal soap" },
];

const MUSHROOM_SUPPLIES = [
  { id: "culture",     label: "Spore syringe or liquid culture", example: "e.g. 10cc syringe, LC jar" },
  { id: "spawn",       label: "Grain spawn",                     example: "e.g. rye berries, WBS, popcorn" },
  { id: "substrate",   label: "Bulk substrate",                  example: "e.g. CVG (coco coir, vermiculite, gypsum)" },
  { id: "tub",         label: "Monotub or shotgun tub",          example: "e.g. 6-qt shoebox, 54-qt tub" },
  { id: "liner",       label: "Tub liner or black paint",        example: "keeps light off the substrate" },
  { id: "filters",     label: "Holes, filter discs or polyfill", example: "for passive fresh air exchange" },
  { id: "tape",        label: "Micropore tape",                  example: "" },
  { id: "sab",         label: "Still air box or flow hood",      example: "clean space to work in" },
  { id: "sterilizer",  label: "Pressure cooker or steriliser",   example: "for grain and substrate" },
  { id: "alcohol",     label: "Isopropyl alcohol and gloves",    example: "70 percent, plus a lighter" },
  { id: "perlite_mush",label: "Perlite",                         example: "humidity under the tub" },
  { id: "mister",      label: "Spray bottle / mister",           example: "" },
  { id: "hygrometer",  label: "Hygrometer and thermometer",      example: "the tub's own numbers" },
  { id: "scale",       label: "Kitchen scale",                   example: "weighing each flush" },
  { id: "dehydrator",  label: "Dehydrator or drying setup",      example: "to cracker dry" },
  { id: "storage",     label: "Airtight jars and desiccant",     example: "for storing dried fruits" },
];

const BY_CROP = { cannabis: CANNABIS_SUPPLIES, mushrooms: MUSHROOM_SUPPLIES };

/** The checklist for a crop. Call it - the list is not the same for both. */
export function SUPPLY_ITEMS(crop) {
  return BY_CROP[cropOf(crop)];
}

/** Look up one item's label whichever crop's list it came from. */
export function supplyLabel(id) {
  return [...CANNABIS_SUPPLIES, ...MUSHROOM_SUPPLIES].find((i) => i.id === id)?.label ?? id;
}

export const SUPPLY_STATUS = ["have", "need_to_order", "not_using"];
export const SUPPLY_STATUS_LABEL = { have: "Have", need_to_order: "Need", not_using: "Skip" };
export const SUPPLY_STATUS_COLOR = {
  have:          { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)",  text: "var(--c-accent)" },
  need_to_order: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24" },
  not_using:     { bg: "var(--c-border-faint)",border: "var(--c-border)","text": "#5a7a5a" },
};
