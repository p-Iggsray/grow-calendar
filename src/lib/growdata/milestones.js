import { daysBetween } from "../dates-core.js";
import { hasSecondaryStrain } from "./phase.js";

export function buildMilestones(config) {
  const m = [];
  // Germination/seedling only show when the grow actually has a pre-transplant
  // window (seed starts). Older/clone grows collapse these onto transplant.
  // Only a real germination window (seed starts expand it before `start`) gets a
  // milestone; clone/veg/old grows collapse germinate onto start.
  // `key` names the config date each milestone reads from, so the journal can
  // move a milestone by writing that key back.
  const germinate = config.germinate ?? config.start;
  if (germinate < config.start) {
    m.push({ key:"germinate", label:"Germination", date:germinate, icon:"🌰", color:"#64748b" });
  }
  m.push(
    { key:"transplant", label:"Transplant",     date:config.transplant, icon:"🌱", color:"#7c3aed" },
    { key:"calMag",     label:"Cal-Mag Starts", date:config.calMag,     icon:"💊", color:"#16a34a" },
    { key:"feedStart",  label:"Feeding Starts", date:config.feedStart,  icon:"🧪", color:"#15803d" },
  );
  // Indoor grows set backyardMove === transplant; only show it when it's a
  // distinct, later day.
  if (config.backyardMove > config.transplant)
    m.push({ key:"backyardMove", label:"Move Outside", date:config.backyardMove, icon:"🏡", color:"#22c55e" });
  m.push(
    { key:"preFlower",   label:"Pre-Flower",      date:config.preFlower,   icon:"🌸", color:"#f59e0b" },
    { key:"flowerStart", label:"Flower",          date:config.flowerStart, icon:"🌺", color:"#f97316" },
    { key:"gdpHarvest",  label:"Primary Harvest", date:config.gdpHarvest,  icon:"✂️", color:"#d97706" },
  );
  // Only genuine two-strain grows get a separate later harvest.
  if (hasSecondaryStrain(config))
    m.push({ key:"hazeHarvest", label:"Final Harvest", date:config.hazeHarvest, icon:"🏆", color:"#b45309" });
  return m;
}

export function getNextMilestone(today, config) {
  const milestones = buildMilestones(config);
  const upcoming = milestones.find(m => daysBetween(m.date, today) > 0);
  if (upcoming) return upcoming;
  // Past the final harvest: surface a stable "season complete" marker instead
  // of "Haze Harvest 0 days ago" looping forever.
  return { label: "Season complete", date: today, icon: "🏆", color: "#16a34a", done: true };
}

export function getGrowProgress(today, config) {
  const seasonStart = config.germinate ?? config.start;
  const total = daysBetween(config.hazeHarvest, seasonStart);
  const done  = Math.max(0, Math.min(total, daysBetween(today, seasonStart)));
  return Math.round((done / total) * 100);
}
