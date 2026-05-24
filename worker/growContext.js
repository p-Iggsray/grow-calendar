// Static grow-plan knowledge for the AI assistant's system prompt. Hand-authored
// from src/lib/growData.js. The 2026 plan is fixed for the season, so this stays
// in sync as long as the plan's dates/dosing don't change. If the plan changes,
// update this file too.
export const GROW_CONTEXT = `
THE GROW
- Personal outdoor grow, Athens, Ohio, 2026 season. 147 days, transplant (May 24) to final harvest (Oct 18).
- 3 plants in 7-gallon fabric pots: 1x Grandaddy Purp (GDP, indica, dense, purple-leaning), 2x Strawberry Haze (sativa, tall, airy buds).
- Soil: Fox Farm Happy Frog + ~20% perlite. Water pH target 6.5 (pH AFTER adding any supplement). Supplements: Botanicare Cal-Mag Plus; Fox Farm trio (Big Bloom, Grow Big, Tiger Bloom).

TIMELINE / PHASES (2026)
- May 21-23: Pre-transplant. Harden off from indoor light to outdoor sun gradually (morning sun first).
- May 24: TRANSPLANT DAY. First watering pH 6.5, NO nutrients. No nutrients for ~3 weeks (Happy Frog has a built-in charge; feeding now burns roots).
- Jun 7 (day 14): Cal-Mag begins, 5ml/gal every watering through the pre-harvest flush.
- Jun 21 (day 28): Fox Farm feeding begins at HALF dose (Big Bloom 1 tbsp/gal + Grow Big 1.5 tsp/gal + Cal-Mag 5ml/gal), alternating with plain Cal-Mag waterings.
- Jul 5 (day 42): FULL dose (Big Bloom 2 tbsp/gal + Grow Big 3 tsp/gal + Cal-Mag 5ml/gal).
- Routine flush days (plain pH 6.5 water only, no nutrients/Cal-Mag): Jun 24, Jul 24, Aug 24.
- Aug 1: Pre-flower / transition. Reduce Grow Big to 2 tsp/gal, introduce Tiger Bloom 1 tsp/gal. Watch for white pistils at nodes.
- Aug 15: Full flower. Drop Grow Big. Big Bloom 2 tbsp + Tiger Bloom 2 tsp + Cal-Mag. Late flower (~day 28+): Big Bloom 3 tbsp.
- Sep 20: GDP pre-harvest flush begins (plain water, 7 days). Both Haze plants keep feeding.
- Sep 27: GDP HARVEST.
- Oct 4: Haze pre-harvest flush begins (plain water, ~14 days).
- Oct 18: HAZE HARVEST (both plants). First frost in Athens is typically Oct 15-20 - watch the forecast nightly from Oct 1; harvest early rather than lose the crop to frost.

HARVEST / CURE: harvest when trichomes are mostly milky/cloudy with ~10-20% amber across several bud sites. Dry hanging at 60-70F, 55-65% RH, gentle airflow, dark, ~7-14 days (sativa Haze can take longer). Cure in jars, burp twice daily the first week then daily; longer cure is better.

THREATS BY STAGE: extreme heat 90F+ (afternoon shade, watch spider mites); cold nights below 50F (growth stalls, below 40F damages - bring pots in); frost (fatal - bring in immediately); multi-day rain during flower (bud rot risk - move under cover); high humidity + no airflow (defoliate dense interior fan leaves); hail (cover immediately); high wind 25+ mph (stake/shelter the tall Haze); pests (spider mites, aphids, caterpillars - inspect leaf undersides daily, neem preventatively during veg).
`.trim();
