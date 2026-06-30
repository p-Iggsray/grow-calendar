import { SUPPLY_ITEMS } from "./supplyChecklist.js";

// ─── Default wizard state ───────────────────────────────────────────────────

export function defaultSurvey() {
  return {
    growName: "",
    environment: "outdoor",
    medium: "soil",
    containerType: "fabric",
    containerGallons: 7,
    plantCount: 1,
    strains: [
      { name: "", type: "hybrid", photo: true, flowerWeeks: 9, count: 1 },
    ],
    startType: "seed",
    currentStage: "germination",
    stageStartDate: "",
    transplantDate: "",
    plantsAlreadyOutside: false,
    vegWeeks: 4,
    location: "",
    experienceLevel: "beginner",
    wateringMethod: "hand",
    extraNotes: "",
    supplies: Object.fromEntries(SUPPLY_ITEMS.map(s => [s.id, "need_to_order"])),
  };
}
