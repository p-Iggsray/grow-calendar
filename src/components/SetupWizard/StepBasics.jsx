import { Label, Input, RadioGroup, NumStepper } from "./styleHelpers.jsx";
import { cropOf, words } from "../../lib/crops.js";

// The space itself. What it is made of is a different question per crop: a tent
// asks about medium and pot size, a monotub asks about substrate and tub size,
// and neither list means anything to the other.
const CANNABIS_MEDIA = [
  { value: "soil",  label: "Soil / potting mix" },
  { value: "coco",  label: "Coco coir" },
  { value: "hydro", label: "Hydro" },
  { value: "other", label: "Other" },
];
const MUSHROOM_MEDIA = [
  { value: "cvg",     label: "CVG (coco, verm, gypsum)" },
  { value: "manure",  label: "Manure based" },
  { value: "masters", label: "Master's mix" },
  { value: "other",   label: "Other" },
];
const CANNABIS_CONTAINERS = [
  { value: "fabric",  label: "Fabric pots" },
  { value: "plastic", label: "Plastic pots" },
  { value: "ground",  label: "In-ground" },
  { value: "other",   label: "Other" },
];
const MUSHROOM_CONTAINERS = [
  { value: "monotub",  label: "Monotub" },
  { value: "shoebox",  label: "Shoebox / shotgun" },
  { value: "bag",      label: "Grow bag" },
  { value: "other",    label: "Other" },
];

export function StepBasics({ survey, update }) {
  const crop = cropOf(survey);
  const w = words(crop);
  const mushrooms = crop === "mushrooms";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Environment name (optional)</Label>
        <Input
          value={survey.growName}
          onChange={v => update("growName", v)}
          placeholder={mushrooms ? "e.g. Monotub A, Fruiting Shelf" : "e.g. Flower Tent, Backyard"}
        />
        <div style={{ fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5, lineHeight: 1.6 }}>
          Leave it blank and we name it after your first {w.variety}.
        </div>
      </div>
      {/* A tub lives indoors by definition, so the question is only worth
          asking where the answer could go either way. */}
      {!mushrooms && (
        <div>
          <Label>Environment</Label>
          <RadioGroup
            value={survey.environment}
            onChange={v => update("environment", v)}
            options={[
              { value: "outdoor",    label: "Outdoor" },
              { value: "indoor",     label: "Indoor" },
              { value: "greenhouse", label: "Greenhouse" },
            ]}
          />
        </div>
      )}
      <div>
        <Label>{mushrooms ? "Bulk substrate" : "Growing medium"}</Label>
        <RadioGroup
          value={survey.medium}
          onChange={v => update("medium", v)}
          options={mushrooms ? MUSHROOM_MEDIA : CANNABIS_MEDIA}
        />
      </div>
      <div>
        <Label>{mushrooms ? "Container" : "Container type"}</Label>
        <RadioGroup
          value={survey.containerType}
          onChange={v => update("containerType", v)}
          options={mushrooms ? MUSHROOM_CONTAINERS : CANNABIS_CONTAINERS}
        />
      </div>
      {mushrooms ? (
        <div>
          <Label>Tub size (quarts)</Label>
          <NumStepper
            value={survey.containerGallons}
            onChange={v => update("containerGallons", v)}
            min={2} max={120} step={2}
            label="qt"
          />
        </div>
      ) : survey.containerType !== "ground" ? (
        <div>
          <Label>Container size (gallons)</Label>
          <NumStepper
            value={survey.containerGallons}
            onChange={v => update("containerGallons", v)}
            min={1} max={30}
            label="gal"
          />
        </div>
      ) : null}
    </div>
  );
}
