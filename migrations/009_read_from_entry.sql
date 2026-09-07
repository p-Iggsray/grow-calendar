-- A day's log can now fill itself in from what was written about that day.
-- This records which of a row's fields came from the entry rather than from
-- the log form, so the journal can say where each number came from and a
-- re-read never overwrites a correction made by hand.
--
-- The worker also self-heals this column on first use - see worker/growLog.js.
ALTER TABLE grow_log ADD COLUMN read_from TEXT;
