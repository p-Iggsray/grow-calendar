-- Custom calendar events: single-day, user-created entries shown on the month
-- grid and in each day's journal. Replaces the removed task-rule engine as the
-- way growers put their own things on the calendar.
-- (The worker also self-heals this table on first use - see worker/events.js.)
CREATE TABLE IF NOT EXISTS grow_events (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  time       TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grow_events_day ON grow_events (grow_id, date);
