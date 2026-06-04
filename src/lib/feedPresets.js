// Feed schedule presets. Applying a preset overwrites phaseOverrides for the
// 5 feeding phases via api.savePlanPhase. Flush and harvest phases are
// unchanged — those tasks are the same regardless of nutrient brand.

export const FEED_PHASES = ["veg_cm", "veg_half", "veg_full", "pre_flower", "flower"];

export const PRESETS = [
  {
    id: "fox_farm",
    name: "Fox Farm Trio",
    icon: "🦊",
    brand: "Big Bloom · Grow Big · Tiger Bloom",
    description: "The liquid trio schedule already built into the default plan. Soil-friendly, widely available.",
    tasks: {
      veg_cm: [
        "MOISTURE CHECK: Lift or finger-test (2 in. deep) each pot. Fabric pots dry faster than plastic — check daily.",
        "CAL-MAG WATERING: Mix 5 ml (1 tsp) Botanicare Cal-Mag Plus per gallon of distilled water. Stir well. Water each pot to runoff when dry.",
        "GROWTH OBSERVATION: Look for new nodes every few days. GDP should widen; Haze should reach upward.",
        "PEST CHECK: Inspect the underside of every leaf on all 3 plants. Catching problems early saves plants.",
      ],
      veg_half: [
        "MOISTURE CHECK: Lift or finger-test. You should be watering every 1–2 days now.",
        "HALF-DOSE FEEDING: Distilled water only. Mix Big Bloom 1 tbsp/gal + Grow Big 1.5 tsp/gal + Cal-Mag 5 ml/gal. Stir well. Water to runoff.",
        "ROTATION: Alternate each watering — nutrient mix one watering, plain Cal-Mag water (5 ml/gal distilled) next. Never nutrients two waterings in a row.",
        "TIP BURN CHECK: Crispy brown leaf tips = overfeeding. Drop to quarter dose on the next feed if you see tip burn.",
        "PEST CHECK: Underside of all leaves on all plants, every day.",
      ],
      veg_full: [
        "MOISTURE CHECK: Lift or finger-test. July heat means fabric pots can need water every 24 hours.",
        "FULL-DOSE FEEDING: Distilled water. Mix Big Bloom 2 tbsp/gal + Grow Big 3 tsp/gal + Cal-Mag 5 ml/gal. Stir well. Water to runoff.",
        "ROTATION: Alternate between full nutrient mix and plain Cal-Mag water (5 ml/gal distilled). Never two nutrient waterings back-to-back.",
        "BACKYARD MOVE WINDOW (July 27–29): Water all pots 2–3 hours before moving. Scout the sunniest backyard spot (8+ hours direct sun). Move one pot at a time — they are heavy.",
        "PEST CHECK: Underside of all leaves daily. Mites and aphids peak in summer heat.",
      ],
      pre_flower: [
        "MOISTURE CHECK: Water when pots feel noticeably lighter — every 1–2 days.",
        "TRANSITION MIX: Drop Grow Big entirely. Distilled water + Big Bloom 2 tbsp/gal + Tiger Bloom 1 tsp/gal + Cal-Mag 5 ml/gal. Water to runoff.",
        "ROTATION: Alternate between transition mix and plain Cal-Mag water (5 ml/gal).",
        "PISTIL WATCH: Check the nodes (where branches meet the main stem) for tiny white hairs — this signals the flip to flower.",
        "STAKE CHECK: Haze plants stretch fast. Tie any leaning branches loosely to stakes now before they get heavier.",
      ],
      flower: [
        "MOISTURE CHECK: Pots can need water every 24 hours during peak flower. Check daily without exception.",
        "BLOOM MIX: Distilled water + Big Bloom 2 tbsp/gal + Tiger Bloom 2 tsp/gal + Cal-Mag 5 ml/gal. Water to runoff.",
        "ROTATION: Alternate bloom mix with plain Cal-Mag water (5 ml/gal distilled).",
        "BUD ROT WATCH: During rain lasting 2+ days, move pots under cover. Check dense bud sites for gray or brown fuzzy growth. It spreads fast — remove any affected material immediately.",
        "TRICHOME CHECK: From week 6 of flower, use a phone macro or loupe weekly. Harvest GDP when trichomes are mostly cloudy with some amber starting.",
        "DEFOLIATION: Remove large fan leaves blocking bud sites — 10–15% of foliage at a time, never all at once.",
      ],
    },
  },
  {
    id: "gh_trio",
    name: "GH Flora Trio",
    icon: "💧",
    brand: "FloraMicro · FloraGro · FloraBloom",
    description: "General Hydroponics Flora Series adapted for outdoor soil. pH management is critical — always check after mixing.",
    tasks: {
      veg_cm: [
        "MOISTURE CHECK: Lift or finger-test (2 in. deep) each pot. Check daily.",
        "CAL-MAG WATERING: Mix 5 ml Cal-Mag Plus per gallon of RO or distilled water. Note: FloraMicro contains calcium — reduce or skip Cal-Mag if you see tip burn.",
        "GROWTH OBSERVATION: Look for new nodes every few days.",
        "PEST CHECK: Inspect underside of all leaves on every plant daily.",
      ],
      veg_half: [
        "MOISTURE CHECK: Lift or finger-test. You should be watering every 1–2 days.",
        "HALF-DOSE FEEDING: RO or distilled water. Mix FloraMicro 5 ml/gal + FloraGro 10 ml/gal + FloraBloom 5 ml/gal. Check pH — adjust to 6.0–7.0 for soil. Water to runoff.",
        "ROTATION: Alternate between nutrient mix and plain water + 5 ml/gal Cal-Mag. Never nutrients two waterings in a row.",
        "pH CHECK: Measure pH every single time after mixing. Off-pH prevents nutrient uptake even if the mix is correct. Target 6.2–6.8.",
        "PEST CHECK: Underside of all leaves daily.",
      ],
      veg_full: [
        "MOISTURE CHECK: July heat means daily watering.",
        "FULL-DOSE FEEDING: RO or distilled water. Mix FloraMicro 7 ml/gal + FloraGro 12 ml/gal + FloraBloom 5 ml/gal. pH to 6.2–6.8. Water to runoff.",
        "ROTATION: Alternate full nutrient mix with plain Cal-Mag water (5 ml/gal). Never two feeds back-to-back.",
        "pH CHECK: Always verify after mixing. Slight imbalances accumulate over weeks and show as deficiencies.",
        "BACKYARD MOVE WINDOW (July 27–29): Water 2–3 hours before moving. Aim for 8+ hours direct sun daily.",
        "PEST CHECK: Underside of all leaves daily.",
      ],
      pre_flower: [
        "MOISTURE CHECK: Water when pots feel noticeably lighter.",
        "TRANSITION MIX: Shift toward bloom ratios. RO/distilled water + FloraMicro 5 ml/gal + FloraGro 3 ml/gal + FloraBloom 8 ml/gal. pH 6.2–6.8. Water to runoff.",
        "ROTATION: Alternate between transition mix and plain Cal-Mag water.",
        "pH CHECK: Phosphorus and potassium uptake is highly pH-sensitive. Target 6.2–6.5 for maximum flower nutrient availability.",
        "PISTIL WATCH: White hairs at the nodes signal the flip to flower.",
        "STAKE CHECK: Haze stretch begins soon — tie branches loosely before they get heavy.",
      ],
      flower: [
        "MOISTURE CHECK: Check daily — pots may need water every 24 hours at peak flower.",
        "BLOOM MIX: RO/distilled water + FloraMicro 5 ml/gal + FloraGro 1 ml/gal + FloraBloom 10 ml/gal. pH 6.2–6.5. Water to runoff.",
        "ROTATION: Alternate bloom mix with plain Cal-Mag water (5 ml/gal).",
        "pH CHECK: More critical during flower — potassium and phosphorus are pH-sensitive and both are peak demand now.",
        "BUD ROT WATCH: Move pots under cover during sustained rain. Check dense bud sites for gray fuzz daily.",
        "TRICHOME CHECK: From week 6, use a loupe or phone macro weekly. Harvest GDP when mostly cloudy with some amber.",
      ],
    },
  },
  {
    id: "organic",
    name: "Organic",
    icon: "🌿",
    brand: "Worm castings · Fish emulsion · Kelp · Molasses",
    description: "Soil amendment and liquid organic schedule. Feeds the soil microbiome instead of the plant directly. Slower response but minimal burn risk.",
    tasks: {
      veg_cm: [
        "MOISTURE CHECK: Lift or finger-test each pot. Fabric pots dry quickly — check daily.",
        "KELP TEA WATERING: Mix 1 tbsp liquid kelp (Neptune's Harvest or Maxicrop) per gallon of dechlorinated tap water. Let tap water sit 24 hours or use a dechlorinator drop. Water to runoff when pots are dry.",
        "TOP-DRESS (every 2 weeks): Spread 1/4 cup worm castings on the soil surface of each pot. Work lightly into the top inch and water in.",
        "PEST PREVENTION: Spray neem oil solution (2 tbsp neem + 1 tsp dish soap per gallon) on all leaves (top and bottom) every 2 weeks. Apply in early morning or evening — never in direct sun.",
        "GROWTH OBSERVATION: New nodes every few days confirm healthy establishment.",
      ],
      veg_half: [
        "MOISTURE CHECK: Lift or finger-test. You should be watering every 1–2 days.",
        "FISH EMULSION TEA: Mix 1 tbsp Alaska Fish Emulsion (5-1-1) per gallon of dechlorinated water. Water to runoff when pots are dry.",
        "ROTATION: Alternate fish tea with plain dechlorinated water + a few drops of liquid kelp.",
        "TOP-DRESS: Worm castings (1/4 cup per pot) every 2 weeks, lightly worked into the top inch.",
        "NEEM PREVENTION: Continue neem oil spray every 2 weeks. Do not skip — outdoor organics attract pests.",
      ],
      veg_full: [
        "MOISTURE CHECK: July heat means checking every morning. Fabric pots can dry out in 24 hours.",
        "COMPOST TEA: Mix 1 tbsp fish emulsion + 1 tsp liquid kelp + 1/2 tsp unsulfured blackstrap molasses per gallon of dechlorinated water. Stir well. Water to runoff.",
        "ROTATION: Alternate compost tea with plain dechlorinated water.",
        "TOP-DRESS: Worm castings (1/4 cup per pot) every 2 weeks.",
        "BACKYARD MOVE WINDOW (July 27–29): Water 2–3 hours before moving. Scout 8+ hours of direct sun.",
        "STOP NEEM OIL 2 WEEKS BEFORE PRE-FLOWER: Cease oil sprays now — neem interferes with terpene development and is difficult to remove from buds.",
      ],
      pre_flower: [
        "MOISTURE CHECK: Water when pots feel noticeably lighter.",
        "BLOOM AMENDMENT TOP-DRESS: Apply 1/4 cup per pot of Dr. Earth Bud & Bloom (3-9-4) or similar organic bloom fertilizer. Work into the top inch of soil and water in with dechlorinated water.",
        "KELP DRENCH: Water with 1 tbsp liquid kelp per gallon. Kelp stimulates the hormones that trigger flower transition.",
        "NO MORE OIL SPRAYS: Do not spray neem or any oil-based product from this point forward — it affects terpenes and coats buds.",
        "PISTIL WATCH: White hairs at the nodes signal the flip to flower.",
        "STAKE CHECK: Haze stretch is coming — tie branches loosely before they get heavy.",
      ],
      flower: [
        "MOISTURE CHECK: Pots may need water every 24 hours during peak flower. Check daily.",
        "MOLASSES DRENCH: Dechlorinated water + 1 tbsp unsulfured blackstrap molasses per gallon + 1 tsp liquid kelp per gallon. Water to runoff. Molasses feeds beneficial soil microbes that unlock phosphorus during flower.",
        "BONE MEAL TEA (weekly): Steep 1 tbsp bone meal in a gallon of water for 24 hours, strain through cloth, apply to soil. Phosphorus fuels bud development.",
        "STOP KELP AFTER WEEK 6: Kelp's natural growth hormones can slow late flower. Switch to molasses + plain water only in the final 3 weeks.",
        "BUD ROT WATCH: Move pots under cover during sustained rain. Check dense bud sites daily for any gray or brown fuzzy growth.",
        "TRICHOME CHECK: From week 6, use a loupe or phone macro weekly. Harvest GDP when trichomes are mostly cloudy with some amber.",
      ],
    },
  },
];
