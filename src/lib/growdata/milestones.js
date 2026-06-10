import { daysBetween } from "../dates-core.js";
import { hasSecondaryStrain } from "./phase.js";

export function buildMilestones(config) {
  const m = [
    { label:"Transplant",     date:config.transplant, icon:"🌱", color:"#7c3aed" },
    { label:"Cal-Mag Starts", date:config.calMag,     icon:"💊", color:"#16a34a" },
    { label:"Feeding Starts", date:config.feedStart,  icon:"🧪", color:"#15803d" },
  ];
  // Indoor grows set backyardMove === transplant; only show it when it's a
  // distinct, later day.
  if (config.backyardMove > config.transplant)
    m.push({ label:"Move Outside", date:config.backyardMove, icon:"🏡", color:"#22c55e" });
  m.push(
    { label:"Pre-Flower",      date:config.preFlower,   icon:"🌸", color:"#f59e0b" },
    { label:"Flower",          date:config.flowerStart, icon:"🌺", color:"#f97316" },
    { label:"Primary Harvest", date:config.gdpHarvest,  icon:"✂️", color:"#d97706" },
  );
  // Only genuine two-strain grows get a separate later harvest.
  if (hasSecondaryStrain(config))
    m.push({ label:"Final Harvest", date:config.hazeHarvest, icon:"🏆", color:"#b45309" });
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
  const total = daysBetween(config.hazeHarvest, config.start);
  const done  = Math.max(0, Math.min(total, daysBetween(today, config.start)));
  return Math.round((done / total) * 100);
}
