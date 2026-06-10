-- Adds first_name and last_name to the users table.
-- Run against the remote DB before deploying the updated worker:
--   npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/002_first_last_name.sql
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
