// ─── Supply checklist ───────────────────────────────────────────────────────

export const SUPPLY_ITEMS = [
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
  { id: "drying",      label: "Drying space",                   example: "dark room, 60-70°F, 55-65% RH" },
  { id: "jars",        label: "Mason jars for curing",          example: "" },
  { id: "neem",        label: "Pest preventative",              example: "e.g. neem oil, insecticidal soap" },
];

export const SUPPLY_STATUS = ["have", "need_to_order", "not_using"];
export const SUPPLY_STATUS_LABEL = { have: "✓ Have", need_to_order: "⏳ Need", not_using: "— Skip" };
export const SUPPLY_STATUS_COLOR = {
  have:          { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)",  text: "var(--c-accent)" },
  need_to_order: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24" },
  not_using:     { bg: "var(--c-border-faint)",border: "var(--c-border)","text": "#5a7a5a" },
};
