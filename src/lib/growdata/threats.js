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

export function getThreatsForPhase(phase, generatedPlan) {
  if (!phase) return [];
  const source = generatedPlan?.threats?.length ? generatedPlan.threats : THREATS;
  return source.filter(t => t.phases.includes(phase));
}
