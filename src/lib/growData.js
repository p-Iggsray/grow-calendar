import { sameDay, daysBetween, fmt, fmtL } from "./dates-core.js";
import { LOCATION } from "./appConfig.js";

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
  flush_gdp:    { label:"GDP Flush",            color:"#a855f7", light:"#f3e8ff", dark:"#581c87" },
  harvest_gdp:  { label:"GDP Harvest",          color:"#d97706", light:"#fef9c3", dark:"#713f12" },
  flower_haze:  { label:"Haze Late Flower",     color:"#ea580c", light:"#fde8d8", dark:"#7c2d12" },
  flush_haze:   { label:"Haze Flush",           color:"#9333ea", light:"#fae8ff", dark:"#581c87" },
  harvest_haze: { label:"Haze Harvest",         color:"#b45309", light:"#fef9c3", dark:"#713f12" },
};

export const THREATS = [
  {
    id:"heat", icon:"🌡️", title:"Extreme Heat (90°F+)",
    desc:"Move pots to afternoon shade or use an umbrella. Do not bring fully inside — morning sun only until the heat breaks. Spider mites thrive in sustained heat. Check undersides of all leaves every day during a heat event.",
    phases:["veg_cm","veg_half","veg_full","pre_flower","flower"],
  },
  {
    id:"cold", icon:"🥶", title:"Cold Nights (Below 50°F)",
    desc:"Growth stalls below 50°F. Below 40°F causes real damage. Bring pots into a garage or shed overnight and return them outside in the morning. Do not leave them out. Applies every night from mid-September onward.",
    phases:["flower","flush_gdp","harvest_gdp","flower_haze","flush_haze","harvest_haze"],
  },
  {
    id:"frost", icon:"❄️", title:"Frost Warning",
    desc:`Any frost warning for ${LOCATION.split(",")[0]} County — bring every pot inside immediately. One hard frost is fatal. Your Haze harvest window (Oct 18) is right on the edge of average first frost for ${LOCATION.split(",")[0]}. Check the forecast every single night from October 1 onward.`,
    phases:["flush_haze","harvest_haze","flower_haze"],
  },
  {
    id:"rain", icon:"🌧️", title:"Multi-Day Rain (During Flower)",
    desc:"Move pots under a covered porch or into a garage if heavy rain continues for more than 2 consecutive days. Plants can go without direct sun for 2 to 3 days without lasting damage. Continuous wet conditions during flower cause bud rot — which is permanent and spreads fast.",
    phases:["pre_flower","flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"humidity", icon:"💧", title:"High Humidity + No Airflow",
    desc:"Above 70% relative humidity with no wind is bud rot weather. Pull dense interior fan leaves that trap moisture inside the canopy. Make sure nothing blocks airflow around the pots. You do not need to move them — just open up the canopy and ensure each pot has open air on all sides.",
    phases:["flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"hail", icon:"⛈️", title:"Hail Forecast",
    desc:"Through late July plants are on the covered front porch — hail cannot reach them. After the backyard move, take every hail warning seriously. Move pots back to the porch or into the garage immediately. Even a brief hailstorm shreds leaves and snaps branches. No recovery from a direct hit during flower. Check the hourly forecast — you usually get 1 to 2 hours of warning.",
    phases:["early_veg","veg_cm","veg_half","veg_full","pre_flower","flower","flush_gdp","flower_haze","flush_haze"],
  },
  {
    id:"wind", icon:"💨", title:"High Winds (25+ MPH)",
    desc:"Strawberry Haze will be 5 to 6 feet tall with heavy buds in late summer. Sustained winds above 25 MPH will snap branches and tip over fabric pots. Tie exposed branches down low before a wind event and move pots to a sheltered spot. Secure or remove bamboo stakes that might lever the root ball.",
    phases:["pre_flower","flower","flush_gdp","flower_haze","flush_haze","harvest_haze"],
  },
  {
    id:"pests", icon:"🐛", title:"Pest Outbreak",
    desc:"Spider mites, aphids, and caterpillars are the main threats outdoors in Ohio. If you see spreading pest activity that you cannot manage outdoors, bring plants temporarily to an isolated indoor spot while you treat. Never bring an infested plant near other houseplants. Neem oil spray preventatively every 2 weeks during veg helps prevent outbreaks.",
    phases:["early_veg","veg_cm","veg_half","veg_full","pre_flower","flower"],
  },
];

export function buildMilestones(config) {
  return [
    { label:"Transplant",       date:config.transplant,   icon:"🌱", color:"#7c3aed" },
    { label:"Cal-Mag Starts",   date:config.calMag,       icon:"💊", color:"#16a34a" },
    { label:"Feeding Starts",   date:config.feedStart,    icon:"🧪", color:"#15803d" },
    { label:"Move to Backyard", date:config.backyardMove, icon:"🏡", color:"#22c55e" },
    { label:"Pre-Flower",       date:config.preFlower,    icon:"🌸", color:"#f59e0b" },
    { label:"Flower",           date:config.flowerStart,  icon:"🌺", color:"#f97316" },
    { label:"GDP Harvest",      date:config.gdpHarvest,   icon:"✂️", color:"#d97706" },
    { label:"Haze Harvest",     date:config.hazeHarvest,  icon:"🏆", color:"#b45309" },
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
        summary: "Keep plants indoors on your brightest windowsill. Supplies arrive in 3 days.",
        tasks: [
          "Place all 3 plants on a south or west-facing windowsill with maximum indoor light.",
          "Check soil moisture. Only water if completely bone dry — no other watering today.",
          "No fertilizer or supplements of any kind.",
          "Confirm Amazon order is set for May 24 delivery.",
          "Confirm the front porch is ready: clear space for all 3 fabric pots with room between them and good airflow. The porch is their home through late July, then they move to the backyard around July 27-29.",
          "Source bricks or pot risers to elevate the fabric pots off the porch floor — improves drainage and keeps pests from entering through the bottom.",
          "Gather all Lowe's supplies: perlite, bamboo stakes, velcro garden tape, watering can, trowel, and a large tarp or bin for mixing soil.",
        ],
        notes: "Minimal handling today. Plants have been moved and need to settle before hardening off begins tomorrow.",
      },
      {
        title: "Harden Off — Day 1 of 3",
        summary: "Begin introducing plants to outdoor conditions. Short exposure only today.",
        tasks: [
          "Check outside temperature. Must be 60°F or above before bringing them out.",
          "Place all 3 plants on the front porch in morning sun only — no harsh afternoon sun yet.",
          "Leave outside for 2 to 3 hours, then bring back indoors.",
          "Going from indoor light directly to full outdoor sun causes light bleaching. Gradual exposure prevents this.",
          "Lightly water if soil is dry when you bring them in.",
          "Confirm the exact front porch spots where each pot will sit. Make sure bricks or risers are in position.",
          "Find a large tarp or plastic storage bin for soil mixing on transplant day.",
        ],
        notes: "Morning sun only today. Afternoon sun in late May is intense. These plants have adapted to indoor light and need gradual adjustment over 2 to 3 days.",
      },
      {
        title: "Harden Off — Day 2 of 3",
        summary: "Extend outdoor time. Final prep before supplies arrive tomorrow.",
        tasks: [
          "Place plants outside in the morning. 4 to 5 hours of sun today including some afternoon exposure is fine.",
          "Bring in before early evening.",
          "DO NOT water heavily today. Moist but not wet soil is ideal for transplanting — a moist root ball holds together when removed from the container.",
          "Set up the front porch pot area: position bricks or risers where each of the 3 fabric pots will sit through late July.",
          "Run through your full supplies checklist: 3x VIVOSUN 7-gal fabric pots, 2x Happy Frog 2 cu ft, 24qt perlite, Cal-Mag Plus, Fox Farm Trio (Big Bloom + Grow Big + Tiger Bloom), gallon jugs of distilled water (for mixing nutrients), trowel, bamboo stakes, velcro tape.",
          "Supplies arrive tomorrow. Being fully prepared means the transplant goes quickly and cleanly.",
        ],
        notes: "Tomorrow is transplant day. A fast transplant means less root exposure and less stress. Set everything up now so you are not hunting for supplies mid-process.",
      },
    ];
    return plans[Math.min(n, 2)];
  }

  if (phase === "transplant") {
    return {
      title: "TRANSPLANT DAY — May 24",
      summary: "Supplies are here. Work through each step in order without skipping any.",
      tasks: [
        "MIX SOIL: On a tarp or in a large bin, combine both bags of Fox Farm Happy Frog with perlite at 80% Happy Frog / 20% perlite. Lightly mist with water while mixing to settle dust. Finished mix should be crumbly and slightly moist — not wet, not dusty.",
        "POSITION POTS: Place all 3 VIVOSUN 7-gallon fabric pots on their front porch spots on bricks or risers. This is their home through late July. Confirm they are getting good morning sun.",
        "PRE-WATER PLANTS: Water the GDP and both Haze plants in their current containers. Wait 45 to 60 minutes. This ensures the root ball holds together when pulled free.",
        "PARTIALLY FILL POTS: Add soil mix until each pot is roughly one-third full. Create a central hole sized to fit the root ball.",
        "TRANSPLANT GRANDADDY PURP: Tip the plant sideways, support the stem base with your palm, let the root ball slide free — do not pull the stem. Place in the center hole. Top of root ball should sit level with or just below surrounding soil. Fill in around the ball, gently firm to close air pockets. Do not compact.",
        "TRANSPLANT STRAWBERRY HAZE x2: Same process for both Haze plants.",
        "LABEL ALL 3 POTS clearly: GDP, Haze 1, Haze 2. You will track them separately later in the season.",
        "STAKE HAZE POTS NOW: Drive 4 to 5 foot bamboo stakes around the perimeter of both Haze pots before roots spread. Avoid driving stakes through the center root ball area.",
        "FIRST WATERING — NO NUTRIENTS: Use plain tap water. Water each pot slowly until runoff flows freely from the bottom. Let drain completely. No nutrients, no supplements.",
        "LEAVE THEM ALONE: Drooping and slight wilting today and tomorrow is normal transplant shock. Do not add more water — they are redirecting energy to root growth. Check moisture again in 2 to 3 days.",
      ],
      notes: "NO NUTRIENTS for 3 weeks until June 21. Happy Frog has a built-in nutrient charge that covers early establishment. Adding nutrients now will burn freshly disturbed roots. Plants live on the covered front porch through late July — backyard move target is July 27-29 when they get too big for the porch.",
    };
  }

  if (phase === "flush") {
    const which = sameDay(date, config.flush1) ? 1 : sameDay(date, config.flush2) ? 2 : 3;
    return {
      title: `Flush Day #${which} — ${fmtL(date)}`,
      summary: "Salt buildup from nutrient feeding blocks uptake over time. Today is plain water only — no nutrients, no Cal-Mag.",
      tasks: [
        "MOISTURE CHECK FIRST: If pots are not ready to water today, postpone this flush by one day. Only flush when you would normally water.",
        "PLAIN WATER ONLY: Use tap water. No Fox Farm nutrients. No Cal-Mag. Nothing added.",
        "Water each pot generously to runoff — slightly more than a normal watering. You are pushing accumulated salts through the medium.",
        "Allow full drainage. Do not let pots sit in runoff water.",
        "RESUME NORMAL SCHEDULE on the very next watering — back to your regular nutrient mix.",
        "While flushing, do a full visual inspection of all leaves, top and bottom. Look for discoloration, spots, webbing, or pest activity.",
        which === 3
          ? "This is the last routine flush. Pre-harvest flushes begin: GDP on September 20, Haze on October 4."
          : `${3 - which} routine flush${3 - which === 1 ? "" : "es"} remaining after today.`,
      ],
      notes: "Fox Farm nutrients are salt-based and accumulate in the medium over time. Flushing every 30 days prevents salt lockout, which mimics deficiency symptoms even when you are feeding correctly.",
    };
  }

  if (phase === "early_veg") {
    return {
      title: `Day ${d} — Early Veg`,
      summary: `Week ${Math.ceil(d / 7)} of establishment. Plants are building roots, not showing much visible growth yet.`,
      tasks: [
        "MOISTURE CHECK: Lift each pot. Noticeably lighter than after last watering means water today. Or push your finger 2 inches into the soil — dry at that depth means water. Fabric pots dry faster than plastic, so check every day.",
        "If moisture check says water: use plain tap water, water slowly to runoff. No nutrients.",
        "If pots still feel heavy: do not water. Small plants in large pots are overwatering's most common victim. When in doubt, wait one more day.",
        d <= 3
          ? "TRANSPLANT SHOCK: Drooping, wilting, or curled leaves in the first 3 days is normal. It is not a watering problem. Leave the plants alone."
          : "NEW GROWTH CHECK: Look for new leaves or nodes emerging at the growing tips. Visible new growth confirms roots have established.",
        "DAILY PEST CHECK: Inspect the underside of leaves on all 3 plants. Look for tiny moving dots (spider mites), clusters of small insects (aphids), or anything unusual.",
        "Confirm pots are not sitting in pooled water in their saucers.",
        d === 7 ? "ONE WEEK MILESTONE: Healthy plants will show at least one new node or set of leaves. Perk, green color, and new growth confirm successful establishment." : "",
      ].filter(Boolean),
      notes: `No nutrients or supplements until Day 14 (${fmt(config.calMag)}) when Cal-Mag begins. Fox Farm nutrients start Day 28 (${fmt(config.feedStart)}). Plain tap water only right now. Plants are on the covered front porch — the roof protects from rain and hail. Backyard move target: July 27-29.`,
    };
  }

  if (phase === "veg_cm") {
    const isFirst = d === 14;
    return {
      title: `Day ${d} — Veg${isFirst ? " (Cal-Mag Starts Today)" : ""}`,
      summary: isFirst
        ? "Cal-Mag begins today. Plants should be showing visible new growth."
        : "Active veg. Cal-Mag goes in every watering from now through pre-harvest flush.",
      tasks: [
        "MOISTURE CHECK: Lift or finger test each pot. Plants are growing and drinking more — you may be watering every 1 to 2 days now.",
        isFirst
          ? "CAL-MAG STARTS TODAY: Mix 5ml (1 tsp) Botanicare Cal-Mag Plus into a gallon of distilled water. Stir well. Water each pot to runoff."
          : "CAL-MAG WATERING: Mix 5ml Cal-Mag per gallon of distilled water. Stir well. Water to runoff when moisture check says water.",
        "GROWTH OBSERVATION: Plants should be adding a new node every few days. GDP will widen and get bushy. Haze will reach upward and get taller.",
        "PEST INSPECTION: Underside of all leaves on all 3 plants, every single day. Catching problems when they are small saves plants.",
        "HAZE HEIGHT: Both Strawberry Haze plants will start pulling ahead of GDP in height this week. Glance at the stakes — confirm they are positioned where the plant is growing toward.",
        d === 21 ? `THREE WEEK MARK: Fox Farm nutrients begin in 7 days on ${fmt(config.feedStart)}. If plants look healthy and growing consistently, you are on track.` : "",
      ].filter(Boolean),
      notes: `Cal-Mag goes into every single watering from now through the pre-harvest flushes. Always use distilled water when mixing Cal-Mag or any supplement. Fox Farm nutrients start Day 28 (${fmt(config.feedStart)}) at half dose. Still on the covered front porch — backyard move coming July 27-29.`,
    };
  }

  if (phase === "veg_half") {
    const isStart = d === 28;
    return {
      title: `Day ${d} — Feeding${isStart ? " Begins (Half Dose)" : ""}`,
      summary: isStart
        ? "Fox Farm nutrients start today at half the recommended dose."
        : "Active veg. Alternate nutrient waterings with plain Cal-Mag waterings.",
      tasks: [
        "MOISTURE CHECK: Lift or finger test. You should be watering every 1 to 2 days now.",
        isStart
          ? "FIRST FEEDING — HALF DOSE: Use distilled water. Mix in this order: Big Bloom 1 tbsp/gal + Grow Big 1.5 tsp/gal + Cal-Mag 5ml/gal. Stir well. Water each pot to runoff."
          : "FEEDING ROTATION: Alternate each watering. Nutrient water (Big Bloom 1 tbsp/gal + Grow Big 1.5 tsp/gal + Cal-Mag 5ml/gal in distilled water) one watering, then plain Cal-Mag water (5ml/gal Cal-Mag in distilled water) next, then nutrient again.",
        "LEAF TIP CHECK: Look at the newest leaf tips on all plants. Brown or yellow crispy tips mean slight overfeeding. Drop to quarter dose on the next feeding if you see tip burn.",
        "GDP SHAPE: GDP should be getting dense and wide. If the very interior center is crowded with no airflow, gently remove a few large fan leaves from the inside — never more than 10 to 15% of total foliage at once.",
        "HAZE SUPPORT: Check both Haze plants. Any branch leaning heavily should be loosely tied to a stake with velcro tape. Never cinch the tape tight against the stem.",
        isStart ? "" : `Full dose begins Day 42 (${fmt(config.fullDose)}) if plants are responding well with no tip burn.`,
      ].filter(Boolean),
      notes: "Half dose first gives you a baseline to gauge response. Fox Farm liquids are concentrated. Starting light protects plants that may still be sensitive from the transplant. Still on the covered front porch — backyard move coming July 27-29.",
    };
  }

  if (phase === "veg_full") {
    const isStart = d === 42;
    const inMoveWindow = d >= 64 && d <= 66; // July 27-29
    const postMove = d > 66;
    return {
      title: `Day ${d} — Full Dose Feeding${isStart ? " Begins" : inMoveWindow ? " · Backyard Move Window" : ""}`,
      summary: isStart
        ? "Stepping up to full Fox Farm dose today. Plants are still on the front porch."
        : inMoveWindow
        ? "This is your backyard move window (July 27-29). Move when they feel too big for the porch."
        : postMove
        ? "Peak vegetative growth. Plants are in the backyard — all weather threats are now active."
        : "Peak vegetative growth. Plants are drinking heavily, especially in July heat.",
      tasks: [
        "MOISTURE CHECK: In July heat, fabric pots can need water every 24 hours. Check daily without exception.",
        isStart
          ? "FULL DOSE STARTS TODAY: Use distilled water. Mix Big Bloom 2 tbsp/gal + Grow Big 3 tsp/gal + Cal-Mag 5ml/gal. Stir well. Water each pot to runoff."
          : "FEEDING ROTATION: Alternate each watering between full nutrient mix (Big Bloom 2 tbsp/gal + Grow Big 3 tsp/gal + Cal-Mag 5ml/gal in distilled water) and plain Cal-Mag water (5ml/gal Cal-Mag in distilled water).",
        inMoveWindow
          ? "BACKYARD MOVE — PICK YOUR DAY THIS WEEK: Move when the plants feel too big for the porch, or just pick today. Steps: (1) Water all 3 pots 2 to 3 hours before moving — moist soil holds the root ball together and makes the pots easier to handle. (2) Scout the sunniest spot in the backyard — 8+ hours direct sun, ideally south or southwest exposure. (3) Set bricks or risers in position before you move the pots. (4) Move one pot at a time — fully watered 7-gallon fabric pots are heavy. (5) Once in the backyard, check all Haze stake ties — plants may have leaned toward the porch light and need adjustment."
          : "",
        inMoveWindow || postMove
          ? "WEATHER THREATS NOW ACTIVE: The porch roof no longer protects. Rain, hail, and high winds are real risks from here on. Start checking the forecast daily."
          : "",
        "HAZE HEIGHT: Strawberry Haze may already be 3 to 4 feet tall and growing fast. Check ties weekly. Add tie points higher on the stakes as plants grow upward.",
        "GDP DENSITY: GDP should be wide, bushy, and dense. Remove select interior fan leaves if there is no airflow to the center — a few at a time, never all at once.",
        "HEAT WATCH: If air temp consistently exceeds 90°F, consider moving pots to afternoon shade. Sustained heat above 90°F slows growth and invites spider mites.",
        "PRE-FLOWER WATCH: Starting late July, begin checking the nodes — where branches meet the main stem — for the first tiny white hairs (pistils). These signal the plant is beginning to transition toward flower.",
      ].filter(Boolean),
      notes: inMoveWindow
        ? `BACKYARD MOVE WINDOW: July 27-29. Pre-flower transition begins around August 1 (Day 69) — you will shift nutrients at that point, reducing Grow Big and introducing Tiger Bloom.`
        : postMove
        ? `Plants are in the backyard — all weather threats fully active. Pre-flower transition begins around August 1 (Day 69). Watch for the first white pistils at the nodes.`
        : `Backyard move window: July 27-29 (Day 64-66). Pre-flower transition begins around August 1 (Day 69). You will shift nutrients at that point — reducing Grow Big, introducing Tiger Bloom.`,
    };
  }

  if (phase === "pre_flower") {
    return {
      title: `Day ${d} — Pre-Flower / Transition`,
      summary: "Days are shortening. Plants are shifting energy toward flower production. White pistils should be visible at nodes.",
      tasks: [
        "MOISTURE CHECK: Continue daily checks. Watering frequency stays similar to peak veg.",
        "TRANSITION NUTRIENTS (nutrient days): Use distilled water. Mix Big Bloom 2 tbsp/gal + Grow Big 2 tsp/gal (reduced from 3) + Tiger Bloom 1 tsp/gal (introduced for first time) + Cal-Mag 5ml/gal. Stir well.",
        "PLAIN WATER DAYS: Mix Cal-Mag 5ml/gal in distilled water. Alternate with nutrient days.",
        "PRE-FLOWER INSPECTION: Check every node where branches meet the main stem on all 3 plants. White hairs forming at those points confirm transition to flower. Note which plants are showing first.",
        "STRETCH PREP: Plants will stretch significantly in height during early flower — Haze especially. Ensure stakes can handle the expected final height. Add taller stakes now if needed.",
        "AIRFLOW: Look at canopy density on all plants. Remove large interior fan leaves blocking airflow to developing bud sites. Good airflow is your primary bud rot defense.",
        "BUD ROT PREVENTION: Ohio August is humid. Confirm no plant is pressed against a fence or wall. Each pot should have open air on all sides.",
      ],
      notes: "Full flower begins around August 15. At that point drop Grow Big entirely and run Tiger Bloom 2 tsp/gal + Big Bloom 2 tbsp/gal + Cal-Mag 5ml/gal.",
    };
  }

  if (phase === "flower") {
    const fd = daysBetween(date, config.flowerStart) + 1;
    const fw = Math.ceil(fd / 7);
    const isLate = fd >= 28;
    return {
      title: `Day ${d} — Flower Week ${fw}`,
      summary: `Flower day ${fd}. Buds are forming and building. GDP flush: ${fmt(config.gdpFlush)}. GDP harvest: ${fmt(config.gdpHarvest)}.`,
      tasks: [
        "MOISTURE CHECK: In flower, let each pot dry down noticeably between waterings. Do not keep soil continuously wet during flower.",
        isLate
          ? "LATE FLOWER NUTRIENTS (nutrient days): Use distilled water. Mix Big Bloom 3 tbsp/gal + Tiger Bloom 2 tsp/gal + Cal-Mag 5ml/gal. Stir well."
          : "FLOWER NUTRIENTS (nutrient days): Use distilled water. Mix Big Bloom 2 tbsp/gal + Tiger Bloom 2 tsp/gal + Cal-Mag 5ml/gal. Stir well.",
        "PLAIN WATER DAYS: Cal-Mag 5ml/gal in distilled water. Alternate with nutrient days.",
        "BUD ROT INSPECTION: Check the interior of dense bud clusters on all plants — especially GDP which forms dense, compact buds. Look for any grey or brown mushy area inside a bud. If found, cut out the affected section immediately with clean scissors and improve airflow.",
        fw >= 3
          ? `TRICHOME WATCH — GDP: Use a jeweler's loupe or phone macro lens. Clear = not ready. Milky/cloudy = approaching window. Mostly milky with 10-20% amber = harvest window. GDP flush starts ${fmt(config.gdpFlush)}.`
          : "BUD DEVELOPMENT: Bud sites on all plants should be visibly forming. GDP buds will be dense and compact. Haze buds are elongated and more airy.",
        "OHIO WEATHER: Heavy sustained rain promotes bud rot. Move pots temporarily under an overhang or covered porch if multi-day rain is forecast.",
      ].filter(Boolean),
      notes: `GDP flush ${fmt(config.gdpFlush)}, harvest ${fmt(config.gdpHarvest)}. Haze continues through ${fmt(config.hazeHarvest)}.`,
    };
  }

  if (phase === "flush_gdp") {
    const fd = daysBetween(date, config.gdpFlush) + 1;
    return {
      title: `GDP Flush — Day ${fd} of 7`,
      summary: "GDP gets plain water only. Both Strawberry Haze plants continue full flower feeding.",
      tasks: [
        "GDP — PLAIN WATER ONLY: Use tap water. No Cal-Mag. No nutrients. Water to runoff.",
        "HAZE — CONTINUE LATE FLOWER NUTRIENTS: Use distilled water. Mix Big Bloom 3 tbsp/gal + Tiger Bloom 2 tsp/gal + Cal-Mag 5ml/gal on their nutrient days.",
        "GDP TRICHOME CHECK: Inspect multiple bud sites. Looking for mostly milky/cloudy trichomes with 10 to 20% amber. Harvest when that ratio is consistent across several bud sites.",
        "GDP APPEARANCE: Fan leaves on GDP will yellow and begin to drop. This is normal — the plant is pulling stored nitrogen from its own leaves to finish the buds.",
        "HAZE OBSERVATION: Both Haze plants are still building. They are not ready. Continue normal care.",
        fd >= 5 ? "GDP harvest is very close. Do a thorough trichome check today and tomorrow before cutting." : `${7 - fd} flush days remaining for GDP.`,
      ].filter(Boolean),
      notes: `GDP harvest target: ${fmtL(config.gdpHarvest)}. The flush clears residual nutrients from plant tissue. A 7-day flush produces a noticeably cleaner final product.`,
    };
  }

  if (phase === "harvest_gdp") {
    return {
      title: "GRANDADDY PURP HARVEST",
      summary: "GDP is ready to come down. Work through these steps carefully.",
      tasks: [
        "FINAL TRICHOME CHECK: Inspect multiple bud sites across the whole plant. Confirm mostly milky/cloudy trichomes with 10 to 20% amber. If still mostly clear, wait 1 to 2 more days.",
        "TOOL PREP: Wipe scissors or pruning shears with isopropyl alcohol before starting.",
        "HARVEST: Cut the main stem at the base, or work branch by branch starting with the most mature colas.",
        "REMOVE FAN LEAVES: Pull large fan leaves off immediately. They do not need to dry and slow airflow around buds.",
        "WET OR DRY TRIM: Wet trim (trim sugar leaves now while fresh) is easier and faster. Dry trim (trim after drying) is more work but some prefer it for aroma.",
        "HANG TO DRY: Hang branches upside down in a dark space with gentle airflow. Target: 60 to 70°F and 55 to 65% relative humidity. Check daily. Small stems snap cleanly when dry — approximately 7 to 14 days.",
        "HAZE PLANTS: Both Strawberry Haze plants continue late-flower care. Haze flush starts October 4. Haze harvest October 18.",
        "CLEAN UP: Rinse and dry the empty GDP fabric pot. Store for next season.",
      ],
      notes: "Slow drying over 10 to 14 days at proper humidity produces far better quality than rushing. Too humid causes mold. Too dry makes it harsh. Dial in 55 to 65% RH.",
    };
  }

  if (phase === "flower_haze") {
    return {
      title: `Day ${d} — Haze Late Flower`,
      summary: "GDP is harvested and drying. Full attention on both Strawberry Haze plants in late flower.",
      tasks: [
        "MOISTURE CHECK on both Haze pots. Continue wet/dry cycling.",
        "HAZE LATE FLOWER NUTRIENTS (nutrient days): Use distilled water. Mix Big Bloom 3 tbsp/gal + Tiger Bloom 2 tsp/gal + Cal-Mag 5ml/gal. Stir well.",
        "PLAIN WATER DAYS: Cal-Mag 5ml/gal in distilled water.",
        "TRICHOME CHECK on both Haze plants: Clear = not ready. You want mostly milky/cloudy with amber beginning before flushing. Haze flush starts October 4.",
        "BUD ROT WATCH: October in Ohio brings cooler and sometimes wet weather — this is peak bud rot risk for Haze. Check inside dense Haze colas daily.",
        `FROST FORECAST: Check ${LOCATION} forecast every night now. First frost in ${LOCATION.split(",")[0]} typically falls October 15 to 20. If frost is predicted before October 18, be prepared to move pots inside overnight. Haze flush starts ${fmt(config.hazeFlush)}.`,
      ],
      notes: "Strawberry Haze finishes in 10 to 12 weeks of flower. Flush begins October 4, harvest October 18. Watch the frost calendar closely from here on.",
    };
  }

  if (phase === "flush_haze") {
    const fd = daysBetween(date, config.hazeFlush) + 1;
    return {
      title: `Haze Flush — Day ${fd} of 14`,
      summary: "Both Strawberry Haze plants get plain water only. Harvest is approaching.",
      tasks: [
        "PLAIN WATER ONLY for both Haze plants: Use tap water. No nutrients. No Cal-Mag. Water to runoff.",
        "TRICHOME CHECK: Looking for mostly milky/cloudy trichomes with 10 to 20% amber across multiple bud sites. Check both plants — they may not be at the exact same stage.",
        `FROST WATCH: Check the 10-day forecast for ${LOCATION} every single night. A hard frost kills the plants. If frost is predicted before October 18, harvest immediately — partial or full.`,
        "LEAF YELLOWING: Fan leaves will yellow and drop. This is expected and correct.",
        "BUD ROT: Continue checking inside colas daily. October humidity and cool nights are the main risk.",
        fd >= 10
          ? "HARVEST IS NEAR: If trichomes look right before October 18, harvest a day early rather than risk frost. A day early is far better than losing the crop to cold."
          : `${14 - fd} flush days remaining.`,
      ].filter(Boolean),
      notes: `Haze harvest target: ${fmtL(config.hazeHarvest)}. If frost threatens before that date, harvest immediately. Partial harvest — cutting the most mature colas first — is also a valid option.`,
    };
  }

  if (phase === "harvest_haze") {
    return {
      title: "STRAWBERRY HAZE HARVEST",
      summary: "Both Strawberry Haze plants come down today. Full grow complete.",
      tasks: [
        "FINAL TRICHOME CHECK on both plants: Mostly milky/cloudy with 10 to 20% amber across multiple bud sites before cutting.",
        "Wipe scissors or shears with isopropyl alcohol before starting.",
        "Harvest one plant at a time. Cut at the base or work branch by branch.",
        "Remove all large fan leaves immediately.",
        "Hang in drying space: 60 to 70°F, 55 to 65% RH, gentle airflow, darkness. Sativa strains can take 10 to 14 days due to denser moisture content.",
        "CURING: After drying (small stems snap cleanly), pack loosely into labeled mason jars. Burp jars twice daily for the first week — open, leave open 10 to 15 minutes, close. Then once daily for 2 more weeks minimum. 4 weeks is significantly better. 8 weeks is the best you can get.",
        "Rinse fabric pots, let dry fully, store for next season.",
        "GROW COMPLETE: GDP harvested September 27. Both Haze harvested October 18. Full season from transplant: 147 days.",
      ],
      notes: "Cure GDP and Haze separately in labeled jars. Both benefit significantly from a long cure — patience here is the most underrated part of the entire grow.",
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

// Phases that use generated static content (not day-specific logic).
const AI_OVERRIDABLE_PHASES = new Set([
  "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flower_haze",
]);

export function getDetail(date, config, overrides, generatedPlan) {
  const phase = getPhase(date, config);
  const aiPhase = phase && AI_OVERRIDABLE_PHASES.has(phase)
    ? generatedPlan?.phases?.[phase]
    : null;

  let base;
  if (aiPhase) {
    const d = dpt(date, config);
    base = {
      title: `Day ${d} — ${PHASES[phase].label}`,
      summary: aiPhase.summary || "",
      tasks: Array.isArray(aiPhase.tasks) ? aiPhase.tasks : [],
      notes: aiPhase.notes || null,
    };
  } else {
    base = generateDetail(date, config);
  }

  if (!base) return null;
  const override = overrides ? overrides[ymdLocal(date)] : undefined;
  return applyDayOverride(base, override);
}
