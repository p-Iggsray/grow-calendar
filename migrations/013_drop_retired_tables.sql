-- Drop the tables and the column the removed assistant and AI features used.
--
-- The worker also does this itself, once, on the owner's next visit - see
-- worker/retiredTables.js. This file is the same change for a database being
-- brought up to date by hand.
DROP TABLE IF EXISTS mj_conversations;
DROP TABLE IF EXISTS mj_usage;
DROP TABLE IF EXISTS mj_model_usage;
DROP TABLE IF EXISTS plan_gen_usage;
DROP TABLE IF EXISTS read_usage;
DROP TABLE IF EXISTS strain_profile;
ALTER TABLE grow_log DROP COLUMN read_from;
