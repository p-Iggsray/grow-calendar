import { Label, Input, RadioGroup, NumStepper } from "./styleHelpers.jsx";

export function StepBasics({ survey, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Grow name</Label>
        <Input value={survey.growName} onChange={v => update("growName", v)} placeholder="e.g. Summer 2026 Outdoor" />
      </div>
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
      <div>
        <Label>Growing medium</Label>
        <RadioGroup
          value={survey.medium}
          onChange={v => update("medium", v)}
          options={[
            { value: "soil",  label: "Soil / potting mix" },
            { value: "coco",  label: "Coco coir" },
            { value: "hydro", label: "Hydro" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>
      <div>
        <Label>Container type</Label>
        <RadioGroup
          value={survey.containerType}
          onChange={v => update("containerType", v)}
          options={[
            { value: "fabric",  label: "Fabric pots" },
            { value: "plastic", label: "Plastic pots" },
            { value: "ground",  label: "In-ground" },
            { value: "other",   label: "Other" },
          ]}
        />
      </div>
      {survey.containerType !== "ground" && (
        <div>
          <Label>Container size (gallons)</Label>
          <NumStepper
            value={survey.containerGallons}
            onChange={v => update("containerGallons", v)}
            min={1} max={30}
            label="gal"
          />
        </div>
      )}
    </div>
  );
}
