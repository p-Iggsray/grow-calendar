import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { Label, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";
import { stageOptions } from "./constants.js";
import AutocompleteInput from "../AutocompleteInput.jsx";
import BreederWeeksField from "../BreederWeeksField.jsx";
import {
  MUSHROOM_SPECIES, cropOf, defaultStage, defaultVarietyType, stagesFor, varietyTypes, words,
} from "../../lib/crops.js";
import { ymd } from "../../lib/api.js";
import { BREEDER_WEEKS, breederWeeks, clampBreederWeeks } from "../../lib/plantClock.js";

function blankEntry(crop) {
  const w = words(crop);
  const mushrooms = cropOf(crop) === "mushrooms";
  const today = ymd(new Date());
  return {
    name: "", strain: "", type: defaultVarietyType(crop), photo: true,
    flowerWeeks: mushrooms ? w.lengthDefault : BREEDER_WEEKS.photo.defaultMin,
    flowerWeeksMax: mushrooms ? null : BREEDER_WEEKS.photo.defaultMax,
    potSize: 0, stage: defaultStage(crop),
    startedOn: today, stageSince: today,
  };
}

// A stage no later than the usual first one began the day the plant did.
function startsWithPlant(crop, stage) {
  const ladder = stagesFor(crop);
  return ladder.indexOf(stage) <= ladder.indexOf(defaultStage(crop));
}

// The catalogue knows one number per strain. Taken as both ends of the range,
// held inside what the plant's type allows; the grower can widen it after.
function catalogWeeks(entry, prev, mushrooms) {
  if (!entry?.flowerWeeks) return {};
  if (mushrooms) return { flowerWeeks: entry.flowerWeeks };
  const photo = typeof entry.photo === "boolean" ? entry.photo : prev.photo;
  const r = clampBreederWeeks({ min: entry.flowerWeeks, max: entry.flowerWeeks }, photo === false);
  return { flowerWeeks: r.min, flowerWeeksMax: r.max };
}

function DateField({ label, value, onChange, min, max, hint }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="date"
        value={value ?? ""}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          width: "100%", boxSizing: "border-box", padding: "11px 13px",
          borderRadius: 10, background: "var(--c-surface-1)", color: "var(--c-text)",
          border: "1px solid var(--c-border-strong)", fontFamily: MONO, fontSize: 14,
        }}
      />
      {hint && <div style={{ fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(var(--c-accent-rgb), 0.15)", border: "1px solid rgba(var(--c-accent-rgb), 0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

// Shared form for both adding and editing one thing in the roster: a plant in
// a tent, a tub in a monotub. Pass `initial` to prefill (edit mode - stage is
// managed by the one-way stage control there, so the stage picker only shows
// when ADDING) and `saveLabel`/`savingLabel` to relabel the primary button.
export default function AddPlantSheet({ crop, onSave, onCancel, saving, initial, saveLabel, savingLabel = "Adding…" }) {
  const w = words(crop);
  const isNew = !initial;
  const [f, setF] = useState(() => {
    const base = { ...blankEntry(crop), ...(initial || {}), potSize: initial?.potSize ?? 0 };
    // A plant saved before the range existed has one number; show it as both.
    if (cropOf(crop) !== "mushrooms") {
      const { min, max } = breederWeeks(base);
      return { ...base, flowerWeeks: min, flowerWeeksMax: max };
    }
    return base;
  });
  // Cannabis strains come from the catalogue every grower here has fed; there
  // is no shared mushroom catalogue yet, so those are the common monotub
  // species offered from the app itself.
  const mushrooms = cropOf(crop) === "mushrooms";
  const [catalog, setCatalog] = useState(() => (mushrooms ? MUSHROOM_SPECIES : []));
  useEffect(() => {
    if (mushrooms) return;
    let alive = true;
    api.getStrains()
      .then((list) => { if (alive) setCatalog(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mushrooms]);
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const today = ymd(new Date());
  // An autoflower's packet quotes a longer span than a photoperiod's, so
  // flipping the type pulls the range inside what the new type allows.
  const setPhoto = (photo) => setF((prev) => ({
    ...prev, photo,
    ...(mushrooms ? {} : (() => {
      const r = clampBreederWeeks({ min: prev.flowerWeeks, max: prev.flowerWeeksMax }, !photo);
      return { flowerWeeks: r.min, flowerWeeksMax: r.max };
    })()),
  }));
  // A seedling or earlier entered its stage the day it started, so the two
  // dates move together until the grower separates them.
  const setStartedOn = (date) => setF((prev) => ({
    ...prev, startedOn: date,
    ...(isNew && startsWithPlant(crop, prev.stage) ? { stageSince: date } : {}),
    ...(prev.stageSince && date > prev.stageSince ? { stageSince: date } : {}),
  }));
  const datesBad = Boolean(f.startedOn && f.stageSince && f.stageSince < f.startedOn);
  const disabled = saving || !f.name.trim() || datesBad;

  function submit() {
    const out = { ...f, potSize: f.potSize || null };
    // The strain field is blank in two quite different situations: this plant
    // is simply called after its strain, or it was released from a strain that
    // was deleted. Sending nothing when the field was not touched keeps
    // whichever is true; blanking it deliberately means the first.
    const typed = (f.strain ?? "").trim();
    if (typed === (initial?.strain ?? "")) delete out.strain;
    else out.strain = typed || null;
    // Edits never change stage; the one-way stage control does that.
    if (!isNew) delete out.stage;
    if (mushrooms) delete out.flowerWeeksMax;
    // Dates are sent only when they say something: on an edit, only when moved.
    if (!out.startedOn || (!isNew && out.startedOn === initial?.startedOn)) delete out.startedOn;
    if (!out.stageSince || (!isNew && out.stageSince === initial?.stageSince)) delete out.stageSince;
    onSave(out);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        {/* What you call THIS plant. Usually the strain, sometimes not, which
            is why the strain has a field of its own below. The shared
            catalogue suggests as you type and fills in what other growers
            recorded, because naming a plant after its strain is the norm. */}
        <Label>Name</Label>
        <AutocompleteInput
          value={f.name}
          onChange={(v) => up("name", v)}
          suggestions={catalog}
          getLabel={(c) => c?.name ?? ""}
          getDetail={(c) => [c?.type, c?.flowerWeeks ? `${c.flowerWeeks}wk` : null].filter(Boolean).join(" · ")}
          onPick={(c) => setF((prev) => ({
            ...prev,
            name: c.name,
            type: c.type ?? prev.type,
            photo: typeof c.photo === "boolean" ? c.photo : prev.photo,
            ...catalogWeeks(c, prev, mushrooms),
          }))}
          placeholder={w.varietyPlaceholder}
        />
      </div>
      <div>
        {/* Only needed when the plant is called something else. Blank means the
            name is the strain, which keeps the common case to one field. */}
        <Label>{w.Variety}</Label>
        <AutocompleteInput
          value={f.strain ?? ""}
          onChange={(v) => up("strain", v)}
          suggestions={catalog}
          getLabel={(c) => c?.name ?? ""}
          getDetail={(c) => [c?.type, c?.flowerWeeks ? `${c.flowerWeeks}wk` : null].filter(Boolean).join(" · ")}
          onPick={(c) => setF((prev) => ({
            ...prev,
            strain: c.name,
            type: c.type ?? prev.type,
            photo: typeof c.photo === "boolean" ? c.photo : prev.photo,
            ...catalogWeeks(c, prev, mushrooms),
          }))}
          placeholder={initial?.strain === "" ? `No ${w.variety}` : (f.name.trim() ? `Same as the name (${f.name.trim()})` : "Same as the name")}
        />
        <div style={{ fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.5 }}>
          {initial?.strain === ""
            ? `This ${w.unit} has no ${w.variety}, because the one it had was removed from your library. Type one to give it another.`
            : `Only if you call the ${w.unit} something other than its ${w.variety}. This is what the library counts.`}
        </div>
      </div>
      {isNew && (
        <>
          <div>
            <Label>Current stage</Label>
            <select
              value={f.stage}
              onChange={(e) => up("stage", e.target.value)}
              aria-label="Current stage"
              style={{
                width: "100%", boxSizing: "border-box", padding: "12px 14px",
                borderRadius: 10, background: "var(--c-surface-1)", color: "var(--c-text)",
                border: "1px solid var(--c-border-strong)", fontFamily: MONO, fontSize: 14,
              }}>
              {stageOptions(crop).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {/* When it really started, and since when it has been in the stage it is
          in now. Both default to today; a plant already weeks along says so
          here, and its age and harvest window count from these. */}
      <DateField
        label="Started on"
        value={f.startedOn}
        max={today}
        onChange={setStartedOn}
        hint={`The day this ${w.unit} sprouted or was started. Its age counts from here.`}
      />
      <DateField
        label={isNew ? "In this stage since" : "In its current stage since"}
        value={f.stageSince}
        min={f.startedOn || undefined}
        max={today}
        onChange={(v) => up("stageSince", v)}
        hint={datesBad
          ? "That is before it started."
          : "The day it entered the stage it is in now. For a photoperiod in flower, the day you flipped it."}
      />
      <div>
        <Label>Type</Label>
        <RadioGroup value={f.type} onChange={(v) => up("type", v)} options={varietyTypes(crop)} />
      </div>
      {/* Photoperiod is a question about light cycles; a tub in the dark has no
          answer to it. */}
      {!mushrooms && (
        <div>
          <Label>Photoperiod or autoflower?</Label>
          <RadioGroup value={f.photo ? "photo" : "auto"} onChange={(v) => setPhoto(v === "photo")} options={[
            { value: "photo", label: "Photoperiod" }, { value: "auto", label: "Autoflower" },
          ]} />
        </div>
      )}
      {mushrooms ? (
        <div>
          <Label>{w.lengthLabel}</Label>
          <NumStepper value={f.flowerWeeks} onChange={(v) => up("flowerWeeks", v)} min={w.lengthMin} max={w.lengthMax} label={w.lengthUnit} />
        </div>
      ) : (
        <BreederWeeksField
          min={f.flowerWeeks}
          max={f.flowerWeeksMax}
          auto={f.photo === false}
          onChange={({ min, max }) => setF((prev) => ({ ...prev, flowerWeeks: min, flowerWeeksMax: max }))}
        />
      )}
      {!mushrooms && (
        <div><Label>Pot size</Label><NumStepper value={f.potSize} onChange={(v) => up("potSize", v)} min={0} max={100} label="gal" /></div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={disabled} onClick={submit} style={btn("primary", disabled)}>
          {saving ? savingLabel : (saveLabel ?? w.addUnit)}
        </button>
      </div>
    </div>
  );
}
