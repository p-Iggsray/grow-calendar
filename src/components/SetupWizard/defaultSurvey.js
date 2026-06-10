import { SUPPLY_ITEMS } from "./supplyChecklist.js";

// ─── Default wizard state ───────────────────────────────────────────────────

export function defaultSurvey() {
  return {
    growName: "",
    environment: "outdoor",
    medium: "soil",
    containerType: "fabric",
    containerGallons: 7,
    plantCount: 2,
    strains: [
      { name: "", type: "hybrid", photo: true, flowerWeeks: 9 },
      { name: "", type: "sativa", photo: true, flowerWeeks: 11 },
    ],
    startType: "clone",
    transplantDate: "",
    vegWeeks: 10,
    location: "",
    experienceLevel: "beginner",
    wateringMethod: "hand",
    extraNotes: "",
    supplies: Object.fromEntries(SUPPLY_ITEMS.map(s => [s.id, "need_to_order"])),
  };
}
