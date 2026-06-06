CREATE TABLE IF NOT EXISTS grows (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','harvested','abandoned')),
  config          TEXT,
  survey          TEXT,
  generated_plan  TEXT,
  phase_overrides TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grows_user_id ON grows(user_id, created_at DESC);
