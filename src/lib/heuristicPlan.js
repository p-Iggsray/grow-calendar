// Offline, fully choice-aware task generator. Produces the same shape as the old
// AI plan (a `phases` map that getDetail consumes), with no network call and no
// quota. Every survey answer changes the rundown: environment, medium, container
// type and size, watering method, strain type, photoperiod vs autoflower, and
// experience level.
//
// All copy is plain ASCII on purpose: no em dashes, no degree symbols, no curly
// quotes, no arrows. Ranges use the word "to". Avoid apostrophes so nothing
// renders as a special character.

function ctxFrom(survey) {
  const s = survey || {};
  const env = s.environment === "indoor" || s.environment === "greenhouse" ? s.environment : "outdoor";
  const medium = ["soil", "coco", "hydro"].includes(s.medium) ? s.medium : "soil";
  const container = ["fabric", "plastic", "ground"].includes(s.containerType) ? s.containerType : "other";
  const gallons = Number(s.containerGallons) || 0;
  const potSize = container === "ground" ? "ground" : gallons > 0 && gallons <= 2 ? "small" : gallons >= 10 ? "large" : "medium";
  const watering = s.wateringMethod === "drip" ? "drip" : "hand";
  const exp = ["beginner", "intermediate", "advanced"].includes(s.experienceLevel) ? s.experienceLevel : "beginner";

  const strains = Array.isArray(s.strains) ? s.strains : [];
  const allAuto = strains.length > 0 && strains.every(st => st.photo === false);
  const anyAuto = strains.some(st => st.photo === false);
  const mixed = anyAuto && !allAuto;
  const primaryType = ["indica", "sativa", "hybrid"].includes(strains[0]?.type) ? strains[0].type : "hybrid";

  return { env, medium, container, gallons, potSize, watering, exp, auto: allAuto, anyAuto, mixed, primaryType };
}

// ── choice-driven snippet library ────────────────────────────────────────────
function feedWater(c, feed) {
  let line;
  if (c.medium === "hydro") {
    line = feed
      ? "Hydro: hold the reservoir at this stage's target strength, keep pH around 5.6 to 6.0, top off daily, and change the water weekly."
      : "Hydro: run plain pH water at a low strength for now, and keep the water cool and aerated.";
  } else if (c.medium === "coco") {
    line = feed
      ? "Coco: feed a balanced mix to a small runoff every day or two, since coco likes steady, light feeding."
      : "Coco: water with plain pH water to a small runoff, and do not let the coco dry out fully.";
  } else {
    line = feed
      ? "Soil: feed on watering days and water until a little drains out. Alternate with plain water if leaf tips start to burn."
      : "Soil: water with plain water only when the top inch is dry, then water to a little runoff.";
  }
  if (c.watering === "drip") line += " Check that every dripper is flowing and none are clogged.";
  return line;
}

function moistureTip(c) {
  let head;
  if (c.container === "fabric") head = "Fabric pots breathe and dry out faster";
  else if (c.container === "plastic") head = "Plastic pots hold water longer";
  else if (c.container === "ground") head = "In-ground soil holds water well";
  else head = "Your containers hold water in between";
  let tail;
  if (c.potSize === "small") tail = "and small pots can dry within a day in heat, so check moisture often";
  else if (c.potSize === "large") tail = "and large pots stay wet a while, so avoid keeping them soggy";
  else if (c.potSize === "ground") tail = "so water deeply and less often";
  else tail = "so lift or feel the pot to judge when it needs water";
  return head + " " + tail + ".";
}

function vegLight(c) {
  if (c.auto) return c.env === "indoor"
    ? "Run lights 18 to 20 hours on every day for the whole grow. Autos flower on age, not on a light change."
    : "Long summer days are ideal. Autos flower on their own age, so no schedule is needed.";
  if (c.env === "indoor") return "Run your lights 18 hours on and 6 hours off during veg.";
  if (c.env === "greenhouse") return "Give full daylight, and add supplemental light if the days are short.";
  return "Give the plants as much direct sun as you can.";
}

function flowerLight(c) {
  if (c.auto) return c.env === "indoor"
    ? "Keep the same long light schedule. Autos do not need a light flip to flower."
    : "No light change needed. Autos flower on their own age.";
  if (c.env === "indoor") return "Switch your lights to 12 hours on and 12 hours off, and block any light leaks.";
  if (c.env === "greenhouse") return "Let the shorter days trigger flower, or use blackout to force it on your schedule.";
  return "The shortening days will push the plants into flower on their own.";
}

function training(c, when) {
  if (c.auto) return "Keep training gentle. Autos have a short life, so skip topping and use only light bending if needed.";
  if (when === "earlyveg") {
    if (c.exp === "advanced") return "Top or fim once the plant has four to five nodes to start an even canopy.";
    if (c.exp === "beginner") return "You can leave the plant be, or gently bend the tallest stem to even out the canopy.";
    return "Top once around the fifth node if you want a wider, more even canopy.";
  }
  if (when === "veg") {
    if (c.exp === "advanced") return "Keep up low stress training and tuck leaves so light reaches the lower bud sites.";
    if (c.exp === "beginner") return "Softly tie down the tall branches so the canopy fills in flat and even.";
    return "Use low stress training to spread the canopy and keep the tops level.";
  }
  if (c.exp === "advanced") return "Finish training and lollipop the lowest larf so energy goes to the main colas.";
  if (c.exp === "beginner") return "Stop training now and just pinch off a couple of the lowest tiny shoots.";
  return "Wrap up training and clear a few of the lowest small shoots.";
}

function stretchNote(c) {
  if (c.primaryType === "sativa") return "Sativa leaning plants can double or triple in height in early flower, so give lots of headroom and strong support.";
  if (c.primaryType === "indica") return "Indica leaning plants stay shorter and bushier, so open the canopy so air reaches the dense lower buds.";
  return "Hybrids stretch a fair amount in early flower, so keep headroom and support ready.";
}

function climate(c) {
  if (c.env === "indoor") return "Keep the room around 70 to 80 F in veg with steady, gentle airflow.";
  if (c.env === "greenhouse") return "Vent the greenhouse on hot afternoons and close it up before cold nights.";
  return "Check the forecast for heat, heavy rain, and strong wind, and plan around it.";
}

function flowerClimate(c) {
  if (c.env === "indoor") return "Aim for around 65 to 78 F and pull humidity down toward 40 to 50 percent as buds fill in.";
  if (c.env === "greenhouse") return "Vent well to keep humidity down, especially overnight when rot risk is highest.";
  return "Keep air moving, and cover the plants if several days of rain are coming.";
}

const PESTS = "Check the underside of the leaves for bugs, spots, or webbing every few days.";
const bTip = (c, t) => c.exp === "beginner" ? t : null;
const aTip = (c, t) => c.exp === "advanced" ? t : null;
const autoTip = (c, t) => c.auto ? t : null;
const mixTip = (c, t) => c.mixed ? t : null;

function P(title, summary, tasks, notes) {
  return { title, summary, tasks: tasks.filter(Boolean), notes: notes || "" };
}

// ── threats, tuned by environment and inputs ─────────────────────────────────
function buildThreats(c) {
  const t = [
    { id: "pests", icon: "bug", title: "Pests", desc: "Spider mites, fungus gnats, thrips, and aphids all start small. Scout the underside of leaves often and act early.", phases: ["seedling", "early_veg", "veg_cm", "veg_half", "veg_full", "pre_flower", "flower"] },
    { id: "overwater", icon: "drop", title: "Overwatering", desc: "Drooping with heavy, wet pots usually means too much water. Let the medium dry back between waterings.", phases: ["seedling", "early_veg", "veg_cm"] },
    { id: "budrot", icon: "warn", title: "Bud rot", desc: "Dense, damp buds can rot from the inside out. Keep air moving and open the canopy in late flower.", phases: ["flower", "flush_gdp", "flush_haze"] },
  ];
  if (c.medium === "coco" || c.medium === "hydro") {
    t.push({ id: "lockout", icon: "warn", title: "Nutrient lockout", desc: "Fast feeding mediums can build up salts or drift in pH, which blocks nutrients. Watch runoff and keep pH in range.", phases: ["veg_half", "veg_full", "flower"] });
  }
  if (c.env === "outdoor") {
    t.push(
      { id: "weather", icon: "storm", title: "Storms and wind", desc: "Heavy rain and wind can snap branches and soak buds. Stake well and move or cover plants before big storms.", phases: ["veg_full", "pre_flower", "flower"] },
      { id: "frost", icon: "cold", title: "Early frost", desc: "A hard frost late in the season can end the grow fast. Watch the overnight lows and be ready to harvest or cover.", phases: ["flush_gdp", "harvest_gdp", "flower_haze", "flush_haze"] },
    );
  } else {
    t.push(
      { id: "heat", icon: "heat", title: "Heat and humidity", desc: "Sealed spaces trap heat and moisture. Hold temperature and humidity in range with airflow and venting.", phases: ["veg_full", "flower"] },
      { id: "mold", icon: "warn", title: "Powdery mildew", desc: "Still, humid air invites white mildew on the leaves. Keep air moving and humidity moderate.", phases: ["veg_full", "pre_flower", "flower"] },
    );
  }
  return t;
}

// ── plan ─────────────────────────────────────────────────────────────────────
export function buildHeuristicPlan(survey) {
  const c = ctxFrom(survey);

  const readySummary = c.env === "indoor"
    ? "Prep your space and gear so transplant day is quick and clean."
    : c.env === "greenhouse"
    ? "Prep the greenhouse and let the plants adjust to brighter light."
    : "Harden the plants to the outdoors and prep for transplant.";
  const readyTasks = c.env === "outdoor"
    ? [
        "Set the plants in gentle morning sun for a few hours, then bring them back to shelter.",
        "Add an hour or two of sun each day so they adjust without burning.",
        "Lay out medium, containers, water, and stakes so transplant goes quickly.",
      ]
    : c.env === "greenhouse"
    ? [
        "Open the greenhouse during the day so plants adjust to brighter light and airflow.",
        "Watch for scorch on the first bright days and shade if needed.",
        "Lay out medium, containers, water, and stakes so transplant goes quickly.",
      ]
    : [
        "Wipe down surfaces and check that the space is clean before transplant.",
        "Set your light height and dial in temperature and airflow before the plants go in.",
        "Lay out medium, containers, water, and stakes so transplant goes quickly.",
      ];

  const phases = {
    germination: P(
      "Germination",
      "Get seeds to crack and pop a taproot. Warm, dark, and damp is the goal.",
      [
        "Keep the seed warm, around 70 to 85 F, and consistently damp but never soggy.",
        c.medium === "hydro"
          ? "For hydro, sprout in a rockwool cube or plug kept moist with plain pH water."
          : "Sprout in a little light, airy starter mix or a damp paper towel.",
        "Keep the seed dark until it cracks and shows a white taproot.",
        "Do not add nutrients. The seed carries its own food to sprout.",
        "Once the taproot shows, plant it root down about a quarter inch deep.",
        bTip(c, "Do not dig the seed up to check on it. Give it two to seven days to pop."),
      ],
      "Most seeds pop in two to seven days. Once green breaks the surface it becomes a seedling."),

    seedling: P(
      "Seedling",
      "Fragile but growing. Gentle light, careful watering, and no feeding yet.",
      [
        c.env === "indoor"
          ? "Keep light gentle and not too close so the seedling does not stretch."
          : c.env === "greenhouse"
          ? "Give soft daylight and shade the harshest midday sun for now."
          : "Give gentle morning sun and shelter from harsh midday light and wind.",
        feedWater(c, false),
        "Keep humidity high with a dome or cover until the first true leaves open.",
        c.medium === "coco" ? "In coco, keep the cube damp but not waterlogged, since seedlings drink very little." : null,
        "No nutrients yet. The starter medium carries the seedling for now.",
        "Watch for a pinched, dark, mushy stem base, which is damping off. Improve airflow and ease off water.",
        autoTip(c, "This is an autoflower, so keep stress low. Every day of a short seedling stage counts."),
      ],
      "Keep it low stress. The first serrated true leaves are your cue that veg is near."),

    pre: P("Getting Ready", readySummary, readyTasks,
      "A fast, well prepped transplant means less root exposure and less stress."),

    transplant: P(
      "Transplant Day",
      "Move each plant into its home. Work in order and take it slow.",
      [
        c.medium === "hydro"
          ? "For hydro, set the plant and its plug into the net pot and set the water level to just touch the plug."
          : "Fill each container about one third full and leave a hole for the root ball.",
        c.potSize === "large" ? "Do not overwater a small plant in a large pot. Water only near the root ball at first." : null,
        c.potSize === "small" ? "Small pots dry fast, so plan to water more often once the plant is in." : null,
        "Water the plant an hour before so the root ball holds together.",
        "Support the stem base, slide the root ball free, and set it level with the surface.",
        "Backfill and firm gently to close air pockets without packing it down.",
        feedWater(c, false),
        c.container === "fabric" ? "Set fabric pots on risers or a tray so they drain and get airflow underneath." : null,
      ],
      "Some droop for a day or two is normal transplant stress. Hold nutrients while the roots settle."),

    early_veg: P(
      "Early Veg",
      "Roots are taking hold. Growth up top is slow for now.",
      [
        feedWater(c, false),
        vegLight(c),
        moistureTip(c),
        "Look for new growth at the tips, which shows the roots have taken hold.",
        PESTS,
        training(c, "earlyveg"),
      ],
      "Plain water for now while the roots build out. Feeding starts once growth picks up."),

    veg_cm: P(
      "Veg, Early Feeding",
      "Plants are growing and drinking more. Start light feeding.",
      [
        feedWater(c, true),
        c.medium === "hydro"
          ? "Start nutrients at a low strength and raise it slowly as the plant drinks more."
          : "Begin feeding at about a quarter to half strength and build up slowly.",
        (c.medium === "coco" || c.medium === "hydro") ? "Add Cal-Mag if you see rusty spots on older leaves, which is common in coco and hydro." : null,
        vegLight(c),
        training(c, "veg"),
        PESTS,
      ],
      "Follow your nutrient brand chart and build strength gradually."),

    veg_half: P(
      "Veg, Building Strength",
      "Active growth. Raise the feed as the plants respond.",
      [
        feedWater(c, true),
        "Crispy brown or yellow leaf tips mean slight overfeeding, so lower the dose next time.",
        training(c, "veg"),
        "If the canopy center is crowded, remove a few interior fan leaves for airflow.",
        climate(c),
        moistureTip(c),
      ],
      "Steady, even growth now sets up a strong flower."),

    veg_full: P(
      "Veg, Full Strength",
      "Peak growth. Plants are drinking heavily and filling out.",
      [
        feedWater(c, true),
        c.auto ? "Autos are near their flip on their own, so avoid heavy work now." : "Finish topping and heavy training now to shape the canopy before flower.",
        stretchNote(c),
        aTip(c, "Consider a light defoliation to open the canopy a few days before the flip."),
        climate(c),
        vegLight(c),
        "Late in veg, start checking the nodes for the first tiny white hairs.",
      ],
      "Get your support in place now. Plants stretch a lot in early flower."),

    flush: P(
      "Flush Day",
      "A plain water flush clears built up salts from the medium.",
      [
        "Only flush when the pot is actually ready for water. Otherwise wait a day.",
        "Use plain water only. No nutrients or supplements today.",
        c.medium === "hydro" ? "For hydro, drain and refill with fresh plain pH water to reset the reservoir." : "Water generously to runoff to push salts through, then let it drain fully.",
        "Go back to your normal feed on the very next watering.",
        "While flushing, look over the leaves top and bottom for any early problems.",
      ],
      "A periodic flush prevents salt buildup that can look like a deficiency."),

    pre_flower: P(
      "Pre Flower",
      "Plants shift toward flower. White hairs start showing at the nodes.",
      [
        flowerLight(c),
        c.medium === "hydro" ? "Move to a bloom nutrient ratio and adjust the reservoir strength for flower." : "Ease off veg nitrogen and shift toward a bloom nutrient with more phosphorus and potassium.",
        stretchNote(c),
        training(c, "preflower"),
        "Open the canopy by removing large inner fan leaves so air moves and light reaches the bud sites.",
        "Make sure stakes, netting, or a trellis can handle the coming stretch and bud weight.",
        autoTip(c, "Autos begin to flower on their own around week four to five from sprout, so no light change is needed."),
        mixTip(c, "You have a mix of strains, so expect them to flower and finish on slightly different schedules."),
      ],
      "Plants can stretch a lot right now, so stay ahead of support."),

    flower: P(
      "Flower",
      "Buds are forming and filling in. Feed for bloom and protect the buds.",
      [
        "Let the pots dry back more between waterings now. Wet, heavy pots in flower invite root and bud problems.",
        feedWater(c, true),
        "Check dense buds for any grey or brown mush inside, and cut out any rot with clean scissors.",
        flowerClimate(c),
        c.primaryType === "indica" ? "Dense indica buds trap moisture, so keep humidity down and air moving through the canopy." : c.primaryType === "sativa" ? "Airy sativa buds handle humidity a bit better, but still want good airflow." : null,
        "From week three on, check trichomes with a loupe. Cloudy with some amber means the harvest window is near.",
        aTip(c, "A light defoliation around week three can open bud sites, but do not overdo it."),
      ],
      "Good airflow and moderate humidity are your main defense against bud rot."),

    flush_gdp: P(
      "Pre Harvest Flush",
      "The first strain to finish gets plain water only as harvest gets close.",
      [
        c.medium === "hydro" ? "Run plain pH water in the reservoir for this strain. No nutrients." : "Plain water only for this strain. No nutrients or supplements. Water to runoff.",
        "Any later finishing strains keep their normal flower feeding.",
        "Check trichomes across several buds. Aim for mostly cloudy with 10 to 20 percent amber.",
        "Yellowing, dropping fan leaves are normal now as the plant finishes.",
        "As harvest nears, check trichomes daily so you cut at the right time.",
      ],
      "The flush clears residual nutrients for a cleaner, smoother final product."),

    harvest_gdp: P(
      "Harvest, First Strain",
      "The first strain is ready to come down. Work through the steps carefully.",
      [
        "Do a final trichome check. Mostly cloudy with some amber. If it is still clear, wait a day or two.",
        "Wipe your scissors or shears with alcohol before you start.",
        "Harvest at the base or branch by branch, starting with the most mature tops.",
        "Remove the large fan leaves right away so they do not slow drying.",
        c.env === "indoor" ? "Hang branches in a dark space around 60 to 70 F with gentle airflow." : c.env === "greenhouse" ? "Hang in a shaded, airy spot out of direct greenhouse heat." : "Hang in a cool, dark, airy spot out of the sun and weather.",
        "Any later finishing strains keep their normal late flower care.",
      ],
      "Dry slowly over about seven to fourteen days, then cure in jars. Aim for 55 to 65 percent humidity while drying."),

    flower_haze: P(
      "Late Flower, Later Strain",
      "Your later finishing strain keeps flowering after the first harvest.",
      [
        "Keep up the wet then dry watering cycle and check moisture often.",
        feedWater(c, true),
        "Check trichomes as harvest gets close. You want mostly cloudy with amber starting.",
        "Inspect dense buds for rot every day, especially in cool or damp weather.",
        c.env === "outdoor" ? "Watch the forecast for frost and be ready to move or cover pots overnight." : "Keep venting to hold humidity down as the buds swell.",
      ],
      "Later strains can need a few extra weeks. Be patient and watch the trichomes."),

    flush_haze: P(
      "Pre Harvest Flush, Later Strain",
      "Your later finishing strain gets plain water only. Harvest is close.",
      [
        c.medium === "hydro" ? "Run plain pH water in the reservoir for this strain. No nutrients." : "Plain water only. No nutrients or supplements. Water to runoff.",
        "Check trichomes across several buds for mostly cloudy with some amber.",
        c.env === "outdoor" ? "If a hard frost is coming before your date, harvest early. A partial harvest beats losing the crop." : "Keep humidity down and airflow steady as the plant finishes.",
        "Yellowing, dropping leaves are expected and fine right now.",
        "Keep checking inside the buds for rot every day.",
      ],
      "A partial harvest, taking the most mature tops first, is always a fine option."),

    harvest_haze: P(
      "Harvest, Later Strain",
      "Your later finishing strain comes down and the grow is complete.",
      [
        "Do a final trichome check, mostly cloudy with some amber, before cutting.",
        "Wipe your scissors or shears with alcohol before you start.",
        "Harvest one plant at a time, at the base or branch by branch.",
        "Remove all the large fan leaves right away.",
        "Hang to dry in a cool, dark, airy spot.",
        "Once small stems snap cleanly, jar the buds and cure. Burp the jars daily at first, then taper off.",
      ],
      "Cure each strain in its own labeled jars. A long, patient cure is well worth it."),
  };

  return { heuristic: true, phases, threats: buildThreats(c) };
}
