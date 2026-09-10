-- How a run in a space ended: the date, whether it finished or was cut short,
-- why, a note, and what each plant became.
--
-- A space outlives what grows in it, so this is recorded WITHOUT touching
-- grows.status. Marking a space harvested or abandoned takes it out of the
-- active view, which is right for a space you are done with and wrong for a bed
-- you will plant again next season.
--
-- JSON array, appended to, never rewritten. See worker/growEnding.js.
ALTER TABLE grows ADD COLUMN endings TEXT;
