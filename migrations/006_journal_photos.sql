-- Journal photos: pictures attached to a day's journal page.
-- (The worker also self-heals this table on first use - see worker/photos.js.)
CREATE TABLE IF NOT EXISTS journal_photos (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  data       TEXT NOT NULL,
  thumb      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_photos_day ON journal_photos (grow_id, date);
