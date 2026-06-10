import { sameDay, daysBetween } from "../dates-core.js";

export const dpt = (date, config) => daysBetween(date, config.transplant);

// A second strain only exists when it finishes later than the primary. For
// single-strain grows fillMissingConfigKeys sets hazeFlush/hazeHarvest equal to
// the primary's, so we must NOT emit the secondary-strain phases — otherwise the
// primary flush/harvest window renders as phantom "Late Flush"/"Final Harvest".
export function hasSecondaryStrain(config) {
  return config.hazeHarvest > config.gdpHarvest;
}

export function getPhase(date, config) {
  if (date < config.start || date > config.hazeHarvest) return null;
  if (date < config.transplant) return "pre";
  const d = dpt(date, config);
  if (d === 0) return "transplant";
  const secondary = hasSecondaryStrain(config);
  if (sameDay(date, config.gdpHarvest))  return "harvest_gdp";
  if (secondary && sameDay(date, config.hazeHarvest)) return "harvest_haze";
  if (sameDay(date, config.flush1) || sameDay(date, config.flush2) || sameDay(date, config.flush3)) return "flush";
  if (secondary && date > config.gdpHarvest && date >= config.hazeFlush) return "flush_haze";
  if (secondary && date > config.gdpHarvest) return "flower_haze";
  if (date >= config.gdpFlush)    return "flush_gdp";
  if (date >= config.flowerStart) return "flower";
  if (date >= config.preFlower)   return "pre_flower";
  if (d >= 42) return "veg_full";
  if (d >= 28) return "veg_half";
  if (d >= 14) return "veg_cm";
  return "early_veg";
}
