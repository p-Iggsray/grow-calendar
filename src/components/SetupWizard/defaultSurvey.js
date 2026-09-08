import { defaultStage, defaultVarietyType, words } from "../../lib/crops.js";

// ─── Default wizard state ───────────────────────────────────────────────────

// A blank survey for one crop. Everything the wizard asks after the first
// question depends on this answer, so switching crop mid-wizard rebuilds the
// answers rather than leaving a monotub holding a container size in gallons.
export function defaultSurvey(crop = "cannabis") {
  const w = words(crop);
  const mushrooms = w.crop === "mushrooms";
  return {
    growName: "",
    crop: w.crop,
    environment: mushrooms ? "indoor" : "outdoor",
    medium: mushrooms ? "cvg" : "soil",
    containerType: mushrooms ? "monotub" : "fabric",
    containerGallons: mushrooms ? 6 : 7,
    plantCount: 1,
    strains: [
      {
        name: "", type: defaultVarietyType(w.crop), photo: true,
        flowerWeeks: w.lengthDefault, count: 1,
      },
    ],
    currentStage: defaultStage(w.crop),
    location: "",
    experienceLevel: "beginner",
    wateringMethod: mushrooms ? "mist" : "hand",
    extraNotes: "",
  };
}
