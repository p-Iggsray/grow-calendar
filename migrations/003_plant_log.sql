-- Per-plant time-series log. plant_id = the stable id on a grow's survey.strains[] entry.
-- Run remotely before/at merge:
--   npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/003_plant_log.sql
CREATE TABLE IF NOT EXISTS plant_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  grow_id     TEXT NOT NULL,
  plant_id    TEXT NOT NULL,
  date        TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  height      REAL,
  height_unit TEXT,
  health      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plant_log
  ON plant_log(user_id, grow_id, plant_id, date DESC);
