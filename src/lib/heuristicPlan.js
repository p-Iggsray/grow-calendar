// Offline, environment-aware task generator. Produces the same shape as the old
// AI plan (a `phases` map that getDetail consumes) but with no network call and
// no quota. Task copy is deliberately plain ASCII: no em dashes, no degree
// symbols, no curly quotes. Ranges are written with the word "to".
//
// The rundown adapts to the grower's survey answers, mainly the environment
// (indoor, greenhouse, outdoor), medium, watering method, and container.

function pick(env, indoor, greenhouse, outdoor) {
  if (env === "indoor") return indoor;
  if (env === "greenhouse") return greenhouse;
  return outdoor;
}

function wateringLine(medium) {
  if (medium === "coco") return "Coco: feed to a small amount of runoff every day or two. Coco likes light, frequent feeding.";
  if (medium === "hydro") return "Hydro: check the reservoir daily. Keep the water cool and topped off and hold a steady pH.";
  return "Soil: water only when the top inch is dry, then water until a little drains from the bottom.";
}

function climateLine(env) {
  return pick(env,
    "Keep the room around 70 to 80 F with steady, gentle airflow.",
    "Vent the greenhouse on hot afternoons and close it up before cold nights.",
    "Check the forecast for heat, heavy rain, and strong wind, and plan around it.");
}

function vegLightLine(env) {
  return pick(env,
    "Run your lights 18 hours on and 6 hours off.",
    "Give full daylight, and add a little supplemental light if the days are short.",
    "Give the plants as much direct sun as you can.");
}

function flowerLightLine(env) {
  return pick(env,
    "Switch your lights to 12 hours on and 12 hours off, and block any light leaks.",
    "Let the shorter days pull the plants into flower, or use blackout if you force it.",
    "The shortening days will push the plants into flower on their own.");
}

const pestsLine = "Check the underside of the leaves for bugs, spots, or webbing every few days.";

function feedNote(env) {
  return pick(env,
    "Indoor plants dry out fast under lights, so watch moisture daily.",
    "Greenhouse temperature swings change how fast pots dry, so check often.",
    "Outdoor heat and wind dry pots quickly, so check moisture often.");
}

function P(title, summary, tasks, notes) {
  return { title, summary, tasks: tasks.filter(Boolean), notes: notes || "" };
}

// ── Threats (a few, tuned per environment) ───────────────────────────────────
function buildThreats(env) {
  const common = [
    { id: "pests", icon: "bug", title: "Pests", desc: "Spider mites, fungus gnats, thrips, and aphids all start small. Scout the underside of leaves often and act early.", phases: ["seedling", "early_veg", "veg_cm", "veg_half", "veg_full", "pre_flower", "flower"] },
    { id: "overwater", icon: "drop", title: "Overwatering", desc: "Drooping with wet, heavy pots usually means too much water. Let the medium dry back between waterings.", phases: ["seedling", "early_veg", "veg_cm"] },
    { id: "budrot", icon: "warn", title: "Bud rot", desc: "Dense, damp buds can rot from the inside. Keep air moving and open the canopy in late flower.", phases: ["flower", "flush_gdp", "flush_haze"] },
  ];
  if (env === "outdoor") {
    common.push(
      { id: "weather", icon: "storm", title: "Storms and wind", desc: "Heavy rain and wind can snap branches and soak buds. Stake well and move pots or cover plants before big storms.", phases: ["veg_full", "pre_flower", "flower"] },
      { id: "frost", icon: "cold", title: "Early frost", desc: "A hard frost late in the season can end the grow fast. Watch overnight lows and be ready to harvest or cover.", phases: ["flush_gdp", "harvest_gdp", "flower_haze", "flush_haze"] },
    );
  } else {
    common.push(
      { id: "heat", icon: "heat", title: "Heat and humidity", desc: "Sealed rooms trap heat and moisture. Keep temperature and humidity in range with airflow and venting.", phases: ["veg_full", "flower"] },
      { id: "mold", icon: "warn", title: "Powdery mildew", desc: "Still, humid air invites white mildew on leaves. Keep air moving and humidity moderate.", phases: ["veg_full", "pre_flower", "flower"] },
    );
  }
  return common;
}

// ── Plan ──────────────────────────────────────────────────────────────────────
export function buildHeuristicPlan(survey) {
  const s = survey || {};
  const env = s.environment === "indoor" || s.environment === "greenhouse" ? s.environment : "outdoor";
  const medium = s.medium || "soil";
  const water = wateringLine(medium);
  const climate = climateLine(env);
  const vegLight = vegLightLine(env);
  const flowerLight = flowerLightLine(env);
  const dryHint = feedNote(env);

  const hardenTasks = pick(env,
    ["Harden is not needed indoors, so keep conditions steady and light gentle.", "Wipe down surfaces and check that your space is clean before transplant.", "Lay out medium, containers, water, and stakes so transplant goes quickly."],
    ["Open the greenhouse during the day to let plants adjust to brighter light and airflow.", "Watch for scorch on the first bright days and shade if needed.", "Lay out medium, containers, water, and stakes so transplant goes quickly."],
    ["Set plants in gentle morning sun for a few hours, then bring them back to shelter.", "Add an hour or two of sun each day so they adjust without burning.", "Lay out medium, containers, water, and stakes so transplant goes quickly."]);

  const phases = {
    germination: P(
      "Germination",
      "Get seeds to crack and pop a taproot. Warm, dark, and damp is the goal.",
      [
        "Keep the medium or paper towel damp, never soggy and never dried out.",
        "Hold it warm, roughly 70 to 85 F. A seedling heat mat helps in a cool room.",
        "Keep seeds dark until they sprout. No light is needed yet.",
        "Do not add any nutrients. The seed has everything it needs to pop.",
        "Once the white taproot shows, plant it root down about a quarter inch deep.",
      ],
      "Most seeds pop in 2 to 7 days. Once green breaks the surface it becomes a seedling."),
    seedling: P(
      "Seedling",
      "Fragile but growing. Gentle light, careful watering, and no feeding yet.",
      [
        pick(env, "Keep light gentle and not too close so the seedling does not stretch.", "Give soft daylight and shade the harshest midday sun.", "Give gentle morning sun and protect from harsh midday light."),
        "Water lightly around the base only when the top of the medium starts to dry.",
        "Keep humidity high with a dome or cover until the first true leaves open.",
        "No nutrients yet. A quality starter mix carries the seedling for now.",
        "Watch for a pinched, dark stem base, which is damping off. Improve airflow and ease off water.",
      ],
      "Keep it low stress. The first serrated true leaves are your cue that veg is near."),
    pre: P(
      "Getting Ready",
      pick(env, "Prep your space and gear so transplant day is quick and clean.", "Prep the greenhouse and let plants adjust to brighter light.", "Harden the plants to the outdoors and prep for transplant."),
      hardenTasks,
      "A fast, well prepped transplant means less root exposure and less stress."),
    transplant: P(
      "Transplant Day",
      "Move each plant into its final container. Work in order and take it slow.",
      [
        "Fill each container about one third full and leave a hole for the root ball.",
        "Water the plants an hour before so the root ball holds together.",
        "Support the stem base, slide the root ball free, and set it level with the surface.",
        "Backfill and firm gently to close air pockets, but do not pack it down.",
        "Water in slowly with plain water until a little drains out. No nutrients.",
        pick(env, "Set the plant back under gentle light and leave it alone to settle.", "Give light shade for a day if the greenhouse is bright.", "Give a little shade for the first day if the sun is strong."),
      ],
      "Some droop for a day or two is normal transplant stress. Hold nutrients while roots settle."),
    early_veg: P(
      "Early Veg",
      "Roots are taking hold. Growth up top is slow for now.",
      [
        water,
        "Use plain water for now. No nutrients yet while roots establish.",
        vegLight,
        "Look for new growth at the tips, which shows roots have taken hold.",
        pestsLine,
      ],
      dryHint),
    veg_cm: P(
      "Veg, Early Feeding",
      "Plants are growing and drinking more. Start light feeding.",
      [
        water,
        "Begin light feeding at a low dose using your nutrient line's early veg amounts.",
        vegLight,
        "Watch for steady new growth at each node.",
        pestsLine,
      ],
      "Follow your nutrient brand's chart and build strength slowly."),
    veg_half: P(
      "Veg, Half Dose Feeding",
      "Active growth. Build nutrient strength gradually.",
      [
        water,
        "Feed at about half the label dose and water to a little runoff.",
        "Crispy brown or yellow leaf tips mean slight overfeeding, so drop the dose next time.",
        "If the canopy center is crowded, remove a few interior fan leaves for airflow.",
        "Loosely tie leaning branches to a support. Never cinch ties tight against the stem.",
      ],
      climate),
    veg_full: P(
      "Veg, Full Dose Feeding",
      "Peak growth. Plants are drinking heavily and filling out.",
      [
        water,
        "Feed at full label dose on feed days and water to a little runoff.",
        "Finish topping or training now to shape the canopy before flower.",
        "Remove a few interior fan leaves if the center has no airflow, a little at a time.",
        climate,
        "Late in veg, start checking the nodes for the first tiny white hairs.",
      ],
      "Get your support in place now. Plants stretch a lot in early flower."),
    flush: P(
      "Flush Day",
      "A plain water flush clears built up nutrient salts from the medium.",
      [
        "Only flush when the pot is actually ready for water. Otherwise wait a day.",
        "Use plain water only. No nutrients or supplements today.",
        "Water generously to runoff to push salts through, then let it drain fully.",
        "Go back to your normal feed on the very next watering.",
        "While flushing, look over the leaves top and bottom for any problems.",
      ],
      "A periodic flush prevents salt buildup that can look like a deficiency."),
    pre_flower: P(
      "Pre Flower",
      "Plants shift toward flower. White hairs start showing at the nodes.",
      [
        water,
        "Ease off heavy veg nitrogen and start shifting toward bloom nutrients.",
        flowerLight,
        "Finish any heavy training now. Avoid big stress once flowering starts.",
        "Open the canopy by removing large interior fan leaves. Airflow is your best defense against rot.",
        "Make sure stakes or supports can handle the coming stretch and bud weight.",
      ],
      "Plants can stretch a lot right now, so stay ahead of support."),
    flower: P(
      "Flower",
      "Buds are forming and filling in. Feed for bloom and protect the buds.",
      [
        "Let pots dry back noticeably between waterings. Do not keep the medium soaked in flower.",
        "Feed bloom nutrients on feed days and water to a little runoff.",
        "Check dense buds for any grey or brown mush inside and cut out any rot you find.",
        pick(env, "Keep humidity moderate and air moving through the canopy.", "Vent well to keep humidity down, especially overnight.", "Keep air moving and cover the plants if several days of rain are coming."),
        "From week three on, check the trichomes with a loupe. Cloudy with some amber means the window is near.",
      ],
      "Good airflow and moderate humidity are the main defense against bud rot."),
    flush_gdp: P(
      "Pre Harvest Flush",
      "Your main strain gets plain water only as harvest gets close.",
      [
        "Plain water only for this strain. No nutrients or supplements. Water to runoff.",
        "Any later finishing strains keep their normal flower feeding.",
        "Check trichomes across several buds. Aim for mostly cloudy with 10 to 20 percent amber.",
        "Yellowing, dropping fan leaves are normal now as the plant finishes.",
        "As harvest nears, check trichomes daily so you cut at the right time.",
      ],
      "The flush clears residual nutrients for a cleaner, smoother final product."),
    harvest_gdp: P(
      "Harvest, Main Strain",
      "Your main strain is ready to come down. Work through the steps carefully.",
      [
        "Do a final trichome check. Mostly cloudy with some amber. If still clear, wait a day or two.",
        "Wipe your scissors or shears with alcohol before you start.",
        "Harvest at the base or branch by branch, starting with the most mature tops.",
        "Remove the large fan leaves right away so they do not slow drying.",
        pick(env, "Hang branches in a dark space around 60 to 70 F with gentle airflow.", "Hang in a shaded, airy spot out of direct greenhouse heat.", "Hang in a cool, dark, airy spot out of the sun and weather."),
        "Any later finishing strains keep their normal late flower care.",
      ],
      "Dry slowly over about 7 to 14 days, then cure in jars. Aim for 55 to 65 percent humidity while drying."),
    flower_haze: P(
      "Late Flower, Later Strain",
      "Your later finishing strain keeps flowering after the main harvest.",
      [
        "Keep up the wet then dry watering cycle and check moisture often.",
        "Continue bloom feeding on feed days.",
        "Check trichomes as harvest approaches. You want mostly cloudy with amber starting.",
        "Inspect dense buds for rot daily, especially in cool or damp weather.",
        env === "outdoor" ? "Watch the forecast for frost and be ready to move or cover pots overnight." : "Keep venting to hold humidity down as the buds swell.",
      ],
      "Later strains can need a few extra weeks. Be patient and watch the trichomes."),
    flush_haze: P(
      "Pre Harvest Flush, Later Strain",
      "Your later finishing strain gets plain water only. Harvest is close.",
      [
        "Plain water only. No nutrients or supplements. Water to runoff.",
        "Check trichomes across several buds for mostly cloudy with some amber.",
        env === "outdoor" ? "If a hard frost is coming before your date, harvest early. A partial harvest beats losing the crop." : "Keep humidity down and airflow steady as the plant finishes.",
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
        "Once small stems snap cleanly, jar the buds and cure. Burp jars daily at first, then taper.",
      ],
      "Cure each strain in its own labeled jars. A long, patient cure is well worth it."),
  };

  return { heuristic: true, phases, threats: buildThreats(env) };
}
