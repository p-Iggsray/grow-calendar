-- Archiving a grow space instead of deleting it.
--
-- A space is archived by stamping this column and unarchived by clearing it.
-- It sits beside `status` rather than inside it so a harvested space stays
-- harvested while it is put away, and is still harvested when it comes back.
--
-- Nothing is removed by this migration. Existing spaces are all unarchived,
-- which is what NULL means.
ALTER TABLE grows ADD COLUMN archived_at TEXT;
