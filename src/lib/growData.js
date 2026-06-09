import { sameDay, daysBetween, fmt, fmtL } from "./dates-core.js";

// Single-character glyph per phase so the calendar is readable without color
// (WCAG 1.4.1). Same-color/different-strain phases share a glyph and rely on
// the surrounding date + aria-label to disambiguate.
export function phaseGlyph(phase) {
  if (!phase) return "";
  if (phase === "pre") return "";
  if (phase === "transplant") return "T";
  if (phase.startsWith("veg") || phase === "early_veg") return "V";
  if (phase.startsWith("flush")) return "~";
  if (phase.startsWith("harvest")) return "H";
  if (phase.startsWith("flower") || phase === "pre_flower") return "F";
  return "";
}

export const PHASES = {
  pre:          { label:"Pre-Transplant",       color:"#5b8dee", light:"#e8f0fe", dark:"#1e3a8a" },
  transplant:   { label:"Transplant Day",       color:"#7c3aed", light:"#f3effe", dark:"#4c1d95" },
  early_veg:    { label:"Early Veg",            color:"#22c55e", light:"#dcfce7", dark:"#14532d" },
  veg_cm:       { label:"Veg + Cal-Mag",        color:"#16a34a", light:"#bbf7d0", dark:"#14532d" },
  veg_half:     { label:"Feeding — Half Dose",  color:"#15803d", light:"#a7f3d0", dark:"#064e3b" },
  veg_full:     { label:"Feeding — Full Dose",  color:"#166534", light:"#6ee7b7", dark:"#022c22" },
  flush:        { label:"Flush Day",            color:"#0ea5e9", light:"#e0f2fe", dark:"#0c4a6e" },
  pre_flower:   { label:"Pre-Flower",           color:"#f59e0b", light:"#fef3c7", dark:"#78350f" },
  flower:       { label:"Flowering",            color:"#f97316", light:"#ffedd5", dark:"#7c2d12" },
  flush_gdp:    { label:"Primary Flush",        color:"#a855f7", light:"#f3e8ff", dark:"#581c87" },
  harvest_gdp:  { label:"Primary Harvest",      color:"#d97706", light:"#fef9c3", dark:"#713f12" },
  flower_haze:  { label:"Late Flower",          color:"#ea580c", light:"#fde8d8", dark:"#7c2d12" },
  flush_haze:   { label:"Late Flush",           color:"#9333ea", light:"#fae8ff", dark:"#581c87" },
  harvest_haze: { label:"Final Harvest",        color:"#b45309", light:"#fef9c3", dark:"#713f12" },
};

// Generic fallback threats — only used when an AI-generated plan doesn't
// supply its own location-specific threat list. Intentionally free of any
// strain, brand, or location specifics so they're safe for any grower.
export const THREATS = [
  {
    id:"heat", icon:"🌡️", title:"Extreme Heat (90°F+)",
    desc:"Move pots to afternoon shade or provide cover during extreme heat. Don't bring them fully indoors — limit to morning sun until the heat breaks. Spider mites thrive in sustained heat, so check the undersides of all leaves daily during a heat event.",
    phases:["veg_cm","veg_half","veg_full","pre_flower","flower"],
  },
  {
    id:"cold", icon:"🥶", title:"Cold Nights (Below 50°F)",
    desc:"Growth stalls below 50°F and near-freezing temperatures cause real damage. Bring pots into a garage or shed overnight and return them outside in the morning. Applies on any cold night, especially late in the season.",
    phases:["flower","flush_gdp","harvest_gdp","flower_haze","flush_haze","harvest_haze"],
  },
  {
    id:"frost", icon:"❄️", title:"Frost Warning",
    desc:"On any frost warning, bring every pot inside immediately — a single hard frost can be fatal. Late-finishing harvests often sit right on the edge of the first frost, so check the forecast every night once fall begins.",
    phases:["flush_haze","harvest_haze","flower_haze"],
  },
  {
    id:"rain", icon:"🌧️", title:"Multi-Day Rain (During Flower)",
    desc:"Move pots under cover if heavy rain continues for more than two days. Plants tolerate a few days without direct sun, but continuous wet conditions during flower cause bud rot, which spreads fast and is permanent.",
    phases:["pre_flower","flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"humidity", icon:"💧", title:"High Humidity + No Airflow",
    desc:"High humidity with no airflow is bud-rot weather. Open up the canopy by removing dense interior fan leaves that trap moisture, and make sure each pot has open air on all sides. You usually don't need to move them — just improve airflow.",
    phases:["flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"hail", icon:"⛈️", title:"Hail Forecast",
    desc:"Severe storms with hail can shred leaves and snap branches, with no recovery from a direct hit during flower. If your plants aren't under permanent cover, move them under a porch or into a garage when hail is forecast — you usually get an hour or two of warning.",
    phases:["early_veg","veg_cm","veg_half","veg_full","pre_flower","flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"wind", icon:"💨", title:"High Winds (25+ MPH)",
    desc:"Tall plants with heavy buds catch the wind. Sustained winds above 25 MPH can snap branches and tip over fabric pots. Tie exposed branches down low and move pots to a sheltered spot before a wind event.",
    phases:["pre_flower","flower","flush_gdp","flower_haze","flush_haze","harvest_haze"],
  },
  {
    id:"pests", icon:"🐛", title:"Pest Outbreak",
    desc:"Spider mites, aphids, and caterpillars are common outdoor threats. If pest activity spreads beyond what you can manage outdoors, isolate the affected plant while you treat it, and never place an infested plant near other houseplants. Preventive neem oil during veg helps prevent outbreaks.",
    phases:["early_veg","veg_cm","veg_half","veg_full","pre_flower","flower"],
  },
];

export function buildMilestones(config) {
  return [
    { label:"Transplant",       date:config.transplant,   icon:"🌱", color:"#7c3aed" },
    { label:"Cal-Mag Starts",   date:config.calMag,       icon:"💊", color:"#16a34a" },
    { label:"Feeding Starts",   date:config.feedStart,    icon:"🧪", color:"#15803d" },
    { label:"Move Outside",     date:config.backyardMove, icon:"🏡", color:"#22c55e" },
    { label:"Pre-Flower",       date:config.preFlower,    icon:"🌸", color:"#f59e0b" },
    { label:"Flower",           date:config.flowerStart,  icon:"🌺", color:"#f97316" },
    { label:"Primary Harvest",  date:config.gdpHarvest,   icon:"✂️", color:"#d97706" },
    { label:"Final Harvest",    date:config.hazeHarvest,  icon:"🏆", color:"#b45309" },
  ];
}

export const dpt = (date, config) => daysBetween(date, config.transplant);

export function getNextMilestone(today, config) {
  const milestones = buildMilestones(config);
  const upcoming = milestones.find(m => daysBetween(m.date, today) > 0);
  if (upcoming) return upcoming;
  // Past the final harvest: surface a stable "season complete" marker instead
  // of "Haze Harvest 0 days ago" looping forever.
  return { label: "Season complete", date: today, icon: "🏆", color: "#16a34a", done: true };
}

export function getGrowProgress(today, config) {
  const total = daysBetween(config.hazeHarvest, config.start);
  const done  = Math.max(0, Math.min(total, daysBetween(today, config.start)));
  return Math.round((done / total) * 100);
}

export function getPhase(date, config) {
  if (date < config.start || date > config.hazeHarvest) return null;
  if (date < config.transplant) return "pre";
  const d = dpt(date, config);
  if (d === 0) return "transplant";
  if (sameDay(date, config.gdpHarvest))  return "harvest_gdp";
  if (sameDay(date, config.hazeHarvest)) return "harvest_haze";
  if (sameDay(date, config.flush1) || sameDay(date, config.flush2) || sameDay(date, config.flush3)) return "flush";
  if (date >= config.hazeFlush)   return "flush_haze";
  if (date >  config.gdpHarvest)  return "flower_haze";
  if (date >= config.gdpFlush)    return "flush_gdp";
  if (date >= config.flowerStart) return "flower";
  if (date >= config.preFlower)   return "pre_flower";
  if (d >= 42) return "veg_full";
  if (d >= 28) return "veg_half";
  if (d >= 14) return "veg_cm";
  return "early_veg";
}

export function getThreatsForPhase(phase, generatedPlan) {
  if (!phase) return [];
  const source = generatedPlan?.threats?.length ? generatedPlan.threats : THREATS;
  return source.filter(t => t.phases.includes(phase));
}

function generateDetail(date, config) {
  const phase = getPhase(date, config);
  if (!phase) return null;
  const d = dpt(date, config);

  if (phase === "pre") {
    const n = daysBetween(date, config.start);
    const plans = [
      {
        title: "Pre-Transplant — Prep Day",
        summary: "Get your space, containers, and supplies ready before transplant.",
        tasks: [
          "Give plants their brightest available light and keep handling to a minimum today.",
          "Check moisture — water only if the medium is nearly dry. No nutrients.",
          "Confirm your containers, medium, and any amendments are on hand.",
          "Prepare and clear the spot where the plants will live, leaving room for airflow around each pot.",
        ],
        notes: "Keep handling light so plants are settled before hardening off begins.",
      },
      {
        title: "Harden Off — Day 1",
        summary: "Begin introducing plants to their outdoor (or final) conditions with short exposure.",
        tasks: [
          "Move plants into gentle morning sun for 2 to 3 hours, then return them to shelter.",
          "Avoid harsh midday sun on the first day to prevent light bleaching.",
          "Lightly water if the medium is dry when you bring them in.",
          "Confirm where each pot will sit and that any risers or supports are in place.",
        ],
        notes: "Gradual light exposure over 2 to 3 days prevents transplant and light shock.",
      },
      {
        title: "Harden Off — Day 2",
        summary: "Extend outdoor time and finish transplant-day prep.",
        tasks: [
          "Give 4 to 5 hours of sun today, including some afternoon exposure.",
          "Keep the medium lightly moist — not wet — so the root ball holds together tomorrow.",
          "Lay out everything you'll need for transplant: medium, containers, water, stakes, and a trowel.",
          "Run through your supply checklist so transplant goes quickly and cleanly.",
        ],
        notes: "A fast, well-prepped transplant means less root exposure and less stress.",
      },
    ];
    return plans[Math.min(n, plans.length - 1)];
  }

  if (phase === "transplant") {
    return {
      title: "Transplant Day",
      summary: "Move each plant into its final container. Work through the steps in order.",
      tasks: [
        "Prepare your medium and fill each container about one-third full, leaving a central hole for the root ball.",
        "Pre-water plants 45 to 60 minutes before transplanting so the root ball holds together.",
        "Support the stem base, slide the root ball free (don't pull the stem), and set it level with or just below the surface.",
        "Backfill around the root ball and firm gently to close air pockets — don't compact.",
        "Label each container, and add stakes or support now if your plants will get tall, avoiding the central root ball.",
        "Water in slowly with plain water until it drains from the bottom. No nutrients.",
        "Leave plants alone afterward — mild droop for a day or two is normal transplant shock.",
      ],
      notes: "Hold nutrients for the first couple of weeks while roots establish — most quality potting mixes carry enough charge for early growth.",
    };
  }

  if (phase === "flush") {
    const which = sameDay(date, config.flush1) ? 1 : sameDay(date, config.flush2) ? 2 : 3;
    return {
      title: `Flush Day #${which} — ${fmtL(date)}`,
      summary: "A plain-water flush clears accumulated nutrient salts from the medium.",
      tasks: [
        "Only flush when the pot is actually ready for water — otherwise postpone a day.",
        "Use plain water only — no nutrients or supplements.",
        "Water generously to runoff to push accumulated salts through the medium, then let it drain fully.",
        "Resume your normal feed on the very next watering.",
        "While flushing, inspect leaves top and bottom for discoloration, spots, webbing, or pests.",
        which === 3
          ? "This is the last routine flush before the pre-harvest flushes begin."
          : `${3 - which} routine flush${3 - which === 1 ? "" : "es"} remaining after today.`,
      ],
      notes: "Salt-based nutrients accumulate over time; a periodic flush prevents lockout that mimics deficiency even when you're feeding correctly.",
    };
  }

  if (phase === "early_veg") {
    return {
      title: `Day ${d} — Early Veg`,
      summary: `Week ${Math.ceil(d / 7)} of establishment. Roots are developing; top growth is slow for now.`,
      tasks: [
        "Moisture check: lift the pot or feel 2 inches deep — water only when it's getting dry. Fabric pots dry faster than plastic.",
        "If it needs water, use plain water to runoff. No nutrients yet.",
        "If the pot still feels heavy, wait — small plants in large pots are easy to overwater.",
        d <= 3
          ? "Early droop or curl is normal transplant shock, not a watering problem — leave plants alone."
          : "Look for new leaves or nodes at the tips, confirming roots have established.",
        "Check leaf undersides for pests daily — tiny moving dots, clustered insects, or anything unusual.",
        "Make sure pots aren't sitting in pooled water.",
      ].filter(Boolean),
      notes: `Plain water only until feeding begins around ${fmt(config.feedStart)}. Let the medium dry between waterings to encourage root growth.`,
    };
  }

  if (phase === "veg_cm") {
    return {
      title: `Day ${d} — Vegetative Growth`,
      summary: "Plants are actively growing and drinking more.",
      tasks: [
        "Moisture check daily — you may be watering every 1 to 2 days now.",
        "Begin light supplementation per your nutrient line's early-veg schedule, using clean water to mix.",
        "Watch for steady new node development.",
        "Inspect leaf undersides for pests every day — catching problems early saves plants.",
        "Check any ties or supports and adjust them toward where each plant is growing.",
      ].filter(Boolean),
      notes: `Follow your nutrient brand's feed chart. Full feeding typically begins around ${fmt(config.feedStart)}.`,
    };
  }

  if (phase === "veg_half") {
    const isStart = d === 28;
    return {
      title: `Day ${d} — Feeding${isStart ? " Begins (Half Dose)" : ""}`,
      summary: isStart
        ? "Start nutrients today at about half the recommended dose."
        : "Active veg. Build nutrient strength gradually as the plants respond.",
      tasks: [
        "Moisture check: you should be watering every 1 to 2 days now.",
        "Feed at roughly half the label dose for your nutrient line; water to runoff.",
        "Check the newest leaf tips — crispy brown or yellow tips mean slight overfeeding, so drop the dose next time.",
        "If the canopy center is crowded with no airflow, remove a few interior fan leaves — never more than 10 to 15% at once.",
        "Loosely tie any heavily leaning branches to a support; never cinch ties tight against the stem.",
      ].filter(Boolean),
      notes: `Starting light gives you a baseline to gauge response. Full dose typically begins around ${fmt(config.fullDose)} if plants respond well with no tip burn.`,
    };
  }

  if (phase === "veg_full") {
    const isStart = d === 42;
    return {
      title: `Day ${d} — Full Dose Feeding${isStart ? " Begins" : ""}`,
      summary: "Peak vegetative growth. Plants are drinking heavily.",
      tasks: [
        "Moisture check daily — in heat, fabric pots can need water every 24 hours.",
        "Feed at full label dose for your nutrient line on feed days; water to runoff.",
        "Finish major training or topping to shape the canopy before flower begins.",
        "Remove a few interior fan leaves if the center has no airflow — a little at a time, never all at once.",
        "If air temperature consistently exceeds 90°F, consider afternoon shade — sustained heat slows growth and invites spider mites.",
        "Check ties and supports weekly and add higher tie points as plants grow upward.",
        "From late veg, start checking the nodes for the first tiny white pistils that signal the transition toward flower.",
      ].filter(Boolean),
      notes: `Pre-flower transition begins around ${fmt(config.preFlower)}. Watch the plants' response and adjust nutrient strength accordingly.`,
    };
  }

  if (phase === "pre_flower") {
    return {
      title: `Day ${d} — Pre-Flower / Transition`,
      summary: "Plants are shifting energy toward flower. White pistils should start appearing at the nodes.",
      tasks: [
        "Continue daily moisture checks — watering frequency stays similar to peak veg.",
        "Begin shifting toward bloom nutrients per your line, easing off heavy veg nitrogen.",
        "Inspect the nodes where branches meet the main stem for white pistils confirming the transition to flower.",
        "Finish any heavy training now — avoid major stress once flowering starts.",
        "Plants stretch significantly in early flower, so make sure your stakes or supports can handle the final height.",
        "Open up the canopy by removing large interior fan leaves that block airflow — good airflow is your main bud-rot defense.",
      ],
      notes: `Full flower begins around ${fmt(config.flowerStart)}. Shift fully to your bloom feeding schedule at that point.`,
    };
  }

  if (phase === "flower") {
    const fd = daysBetween(date, config.flowerStart) + 1;
    const fw = Math.ceil(fd / 7);
    return {
      title: `Day ${d} — Flower Week ${fw}`,
      summary: `Flower day ${fd}. Buds are forming and building.`,
      tasks: [
        "Let each pot dry down noticeably between waterings — don't keep the medium continuously wet during flower.",
        "Feed bloom nutrients per your line on feed days; water to runoff.",
        "Inspect dense bud clusters for any grey or brown mushy rot inside — cut out affected sections with clean scissors and improve airflow if found.",
        fw >= 3
          ? `Check trichomes with a loupe or phone macro: clear = not ready, milky/cloudy = approaching, mostly milky with 10-20% amber = harvest window. Pre-harvest flush starts around ${fmt(config.gdpFlush)}.`
          : "Bud sites should be visibly forming across the canopy.",
        "Keep humidity moderate and air moving through the canopy. Move pots under cover if multi-day rain is forecast during flower.",
      ].filter(Boolean),
      notes: `Primary-strain flush around ${fmt(config.gdpFlush)}, harvest around ${fmt(config.gdpHarvest)}. Any later strain continues through ${fmt(config.hazeHarvest)}.`,
    };
  }

  if (phase === "flush_gdp") {
    const fd = daysBetween(date, config.gdpFlush) + 1;
    return {
      title: `Pre-Harvest Flush — Day ${fd}`,
      summary: "Your primary strain gets plain water only as harvest approaches.",
      tasks: [
        "Primary strain: plain water only — no nutrients or supplements. Water to runoff.",
        "Any later-finishing strains continue their normal flower feeding.",
        "Check trichomes across several bud sites — aim for mostly milky/cloudy with 10 to 20% amber, consistent across sites.",
        "Yellowing, dropping fan leaves are normal now as the plant pulls stored nitrogen to finish the buds.",
        fd >= 5 ? "Harvest is very close — do a thorough trichome check today and tomorrow before cutting." : `${Math.max(0, 7 - fd)} flush days remaining for this strain.`,
      ].filter(Boolean),
      notes: `Primary harvest target: ${fmtL(config.gdpHarvest)}. The flush clears residual nutrients for a cleaner final product.`,
    };
  }

  if (phase === "harvest_gdp") {
    return {
      title: "Harvest — Primary Strain",
      summary: "Your primary strain is ready to come down. Work through the steps carefully.",
      tasks: [
        "Final trichome check across the whole plant — mostly milky/cloudy with 10 to 20% amber. If still mostly clear, wait 1 to 2 more days.",
        "Wipe scissors or shears with isopropyl alcohol before starting.",
        "Harvest at the base or work branch by branch, starting with the most mature colas.",
        "Remove large fan leaves right away — they slow airflow around the buds.",
        "Decide on wet trim (now, while fresh) or dry trim (after drying).",
        "Hang branches in a dark space with gentle airflow at 60 to 70°F and 55 to 65% humidity; drying takes about 7 to 14 days.",
        "Any later-finishing strains continue their normal late-flower care.",
      ],
      notes: "Dry slowly over 10 to 14 days at proper humidity, then cure in jars — too humid causes mold, too dry makes it harsh. Aim for 55 to 65% RH.",
    };
  }

  if (phase === "flower_haze") {
    return {
      title: `Day ${d} — Late Flower (Later Strain)`,
      summary: "Your later-finishing strain continues flowering after the primary harvest.",
      tasks: [
        "Moisture check and continue the wet/dry cycle.",
        "Continue bloom feeding on feed days per your nutrient line.",
        "Check trichomes as harvest approaches — you want mostly milky/cloudy with amber beginning before flushing.",
        "Inspect dense colas for bud rot daily, especially in cool or humid weather.",
        `If frost is possible in your area, watch the forecast and be ready to move pots inside overnight. Flush starts around ${fmt(config.hazeFlush)}.`,
      ],
      notes: `Later-finishing strains may need a few extra weeks. Harvest target around ${fmtL(config.hazeHarvest)}.`,
    };
  }

  if (phase === "flush_haze") {
    const fd = daysBetween(date, config.hazeFlush) + 1;
    return {
      title: `Pre-Harvest Flush (Later Strain) — Day ${fd}`,
      summary: "Your later-finishing strain gets plain water only. Harvest is approaching.",
      tasks: [
        "Plain water only — no nutrients or supplements. Water to runoff.",
        "Check trichomes across multiple bud sites — mostly milky/cloudy with 10 to 20% amber.",
        "If a hard frost is forecast before your harvest date, harvest immediately — a partial or full harvest beats losing the crop to cold.",
        "Yellowing, dropping fan leaves are expected and correct now.",
        "Keep checking inside colas for bud rot daily, especially in cool, humid weather.",
        fd >= 10 ? "Harvest is near — if trichomes look right, don't wait." : `${Math.max(0, 14 - fd)} flush days remaining.`,
      ].filter(Boolean),
      notes: `Harvest target: ${fmtL(config.hazeHarvest)}. A partial harvest — cutting the most mature colas first — is always a valid option.`,
    };
  }

  if (phase === "harvest_haze") {
    return {
      title: "Harvest — Later Strain",
      summary: "Your later-finishing strain comes down today — the grow is complete.",
      tasks: [
        "Final trichome check — mostly milky/cloudy with 10 to 20% amber across several bud sites before cutting.",
        "Wipe scissors or shears with isopropyl alcohol before starting.",
        "Harvest one plant at a time, at the base or branch by branch.",
        "Remove all large fan leaves right away.",
        "Hang to dry in darkness with gentle airflow at 60 to 70°F and 55 to 65% humidity.",
        "Once small stems snap cleanly, pack loosely into labeled jars and cure — burp jars daily at first, then taper over several weeks. A longer cure is better.",
        "Rinse containers, let them dry fully, and store for next season.",
      ],
      notes: "Cure each strain separately in labeled jars. A long, patient cure is one of the most underrated steps of the whole grow.",
    };
  }

  return null;
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Apply a per-day override onto generated detail. Order: edit in place, drop by
// original index, then append. Indices refer to the generated task list.
function applyDayOverride(detail, override) {
  if (!detail || !override) return detail;
  let tasks = detail.tasks.slice();
  if (override.editedTasks) {
    for (const [i, text] of Object.entries(override.editedTasks)) {
      const idx = Number(i);
      if (idx >= 0 && idx < tasks.length) tasks[idx] = text;
    }
  }
  if (Array.isArray(override.removedTasks)) {
    const drop = new Set(override.removedTasks);
    tasks = tasks.filter((_, idx) => !drop.has(idx));
  }
  if (Array.isArray(override.addedTasks)) {
    tasks = tasks.concat(override.addedTasks);
  }
  return {
    ...detail,
    tasks,
    // payload key is `note`; it overrides the rendered `notes` field (what DayView shows).
    notes: override.note != null ? override.note : detail.notes,
    // `warning` has no base equivalent; only attach when provided (UI for it lands with MJ).
    ...(override.warning != null ? { warning: override.warning } : {}),
  };
}

// Apply a phase-level override onto base detail. Phase overrides store the
// complete task array (full-replace, not diff) so they survive AI regeneration
// without index drift.
function applyPhaseOverride(detail, override) {
  if (!override) return detail;
  return {
    ...detail,
    ...(override.title    != null ? { title:   override.title   } : {}),
    ...(override.summary  != null ? { summary: override.summary } : {}),
    ...(override.notes   !== undefined ? { notes: override.notes  } : {}),
    tasks: Array.isArray(override.tasks) ? override.tasks : detail.tasks,
  };
}

// getDetail now accepts an optional phaseOverrides map so the Plan editor's
// manual edits layer on top of AI content (and survive regeneration).
export function getDetail(date, config, overrides, generatedPlan, phaseOverrides) {
  const phase = getPhase(date, config);
  if (!phase) return null;

  const d = dpt(date, config);
  const aiPhases = generatedPlan?.phases ?? {};
  let base;

  if (phase === "pre" && aiPhases.pre?.days) {
    const n = daysBetween(date, config.start);
    const entry = aiPhases.pre.days[Math.min(n, aiPhases.pre.days.length - 1)];
    base = entry
      ? { title: entry.title || "Pre-Transplant", summary: entry.summary || "", tasks: Array.isArray(entry.tasks) ? entry.tasks : [], notes: entry.notes || null }
      : generateDetail(date, config);
  } else if (aiPhases[phase]) {
    const ai = aiPhases[phase];
    base = {
      title: ai.title || `Day ${d} — ${PHASES[phase]?.label ?? phase}`,
      summary: ai.summary || "",
      tasks: Array.isArray(ai.tasks) ? ai.tasks : [],
      notes: ai.notes || null,
    };
  } else {
    base = generateDetail(date, config);
  }

  if (!base) return null;

  // Phase-level override (survives AI regeneration — full task array).
  if (phaseOverrides?.[phase]) {
    base = applyPhaseOverride(base, phaseOverrides[phase]);
  }

  // Day-level override (most specific — from MJ tool-use or user day edits).
  const dayOverride = overrides ? overrides[ymdLocal(date)] : undefined;
  return applyDayOverride(base, dayOverride);
}
