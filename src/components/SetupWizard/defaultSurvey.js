import { SUPPLY_ITEMS } from "./supplyChecklist.js";

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

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
    stageStartDate: todayIso(),
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
