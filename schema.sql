-- Run with: npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  first_name    TEXT,
  last_name     TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  email         TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at   TEXT NOT NULL
);

-- Per-day data is grow-scoped (grow_id in the primary key) so a user running
-- multiple concurrent grows doesn't share checkoffs/notes/log across them.
-- Existing databases are migrated in code by ensurePerDayGrowScope().
CREATE TABLE IF NOT EXISTS task_checkoffs (
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  task_index INTEGER NOT NULL,
  state      TEXT NOT NULL DEFAULT 'done' CHECK(state IN ('done','skipped','blocked')),
  checked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, grow_id, date, task_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS task_notes (
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  task_index INTEGER NOT NULL,
  note       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, grow_id, date, task_index),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migrations for existing databases (skip on fresh installs):
-- ALTER TABLE task_checkoffs ADD COLUMN state TEXT NOT NULL DEFAULT 'done';

CREATE INDEX IF NOT EXISTS idx_checkoffs_user_date ON task_checkoffs(user_id, grow_id, date);

CREATE TABLE IF NOT EXISTS day_notes (
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, grow_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plan_config (
  user_id        INTEGER PRIMARY KEY,
  config         TEXT NOT NULL,
  survey         TEXT,           -- JSON: grow survey answers submitted by the user
  generated_plan TEXT,           -- JSON: AI-generated plan metadata (phases, threats, etc.)
  phase_overrides TEXT,          -- JSON: per-phase task overrides that survive AI regeneration
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration for existing databases (skip on fresh installs where CREATE TABLE above runs):
-- ALTER TABLE plan_config ADD COLUMN survey TEXT;
-- ALTER TABLE plan_config ADD COLUMN generated_plan TEXT;
-- ALTER TABLE plan_config ADD COLUMN phase_overrides TEXT;

CREATE TABLE IF NOT EXISTS plan_day_overrides (
  user_id    INTEGER NOT NULL,
  grow_id    TEXT NOT NULL,
  date       TEXT NOT NULL,      -- YYYY-MM-DD
  payload    TEXT NOT NULL,      -- JSON: addedTasks/editedTasks/removedTasks/note/warning
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, grow_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration for existing databases:
-- ALTER TABLE users ADD COLUMN email TEXT;
-- ALTER TABLE users ADD COLUMN first_name TEXT; ALTER TABLE users ADD COLUMN last_name TEXT;

CREATE TABLE IF NOT EXISTS grow_log (
  user_id      INTEGER NOT NULL,
  grow_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  water_gal    REAL,
  feed         TEXT,
  temp_high    REAL,
  temp_low     REAL,
  humidity     REAL,
  ec_in        REAL,
  ec_out       REAL,
  water_plants TEXT,
  training     TEXT,
  plant_health TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, grow_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration for existing databases (skip on fresh installs):
-- Run the CREATE TABLE IF NOT EXISTS above directly — it's a new table.

CREATE TABLE IF NOT EXISTS mj_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Per-model global daily call counts, separate from the per-user cap table.
-- model values match the GEMINI_*_MODEL constants in worker/mj.js.
CREATE TABLE IF NOT EXISTS mj_model_usage (
  model TEXT NOT NULL,
  date  TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model, date)
);

-- Per-user daily AI plan-generation counts (setup + regenerate). Capped by
-- PLAN_GEN_DAILY_CAP in worker/limits.js to stay within the Gemini free tier.
-- Also lazily created at runtime by ensurePlanUsageSchema() in worker/planSetup.js.
CREATE TABLE IF NOT EXISTS plan_gen_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS mj_conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content    TEXT NOT NULL,
  actions    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_mj_conversations_user ON mj_conversations(user_id, id DESC);

-- Client-side JS errors reported by the browser. user_id is nullable so
-- errors that occur before login (or from unapproved users) can still be stored.
CREATE TABLE IF NOT EXISTS client_errors (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ts       TEXT NOT NULL,
  message  TEXT NOT NULL,
  stack    TEXT,
  url      TEXT
);


-- NWS weather data cache. Keyed by type+coordinates; worker refreshes every 10 min.
CREATE TABLE IF NOT EXISTS weather_cache (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Generic key/value store for app settings (e.g. auto-generated VAPID keys).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Web Push subscriptions. One row per browser/device per user.
-- endpoint is globally unique per push service specification.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Migration for existing databases (skip on fresh installs):
-- CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);

-- R2-backed media attachments (photos + voice notes) per user per day.
CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,      -- YYYY-MM-DD
  kind       TEXT NOT NULL CHECK(kind IN ('photo','audio')),
  r2_key     TEXT NOT NULL UNIQUE,
  mime_type  TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_user_date ON media(user_id, date);

-- Migration for existing databases (skip on fresh installs):
-- CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('photo','audio')), r2_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
-- CREATE INDEX IF NOT EXISTS idx_media_user_date ON media(user_id, date);

-- Multi-grow support: each user can have multiple grow plans.
-- Auto-migrated from plan_config on first GET /api/grows.
CREATE TABLE IF NOT EXISTS grows (
  id              TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','harvested','abandoned')),
  config          TEXT,             -- JSON: drive dates
  survey          TEXT,             -- JSON: grow survey
  generated_plan  TEXT,            -- JSON: AI-generated plan
  phase_overrides TEXT,            -- JSON: per-phase task overrides
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grows_user_id ON grows(user_id, created_at DESC);

-- Migration for existing databases (skip on fresh installs):
-- CREATE TABLE IF NOT EXISTS grows (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, display_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','harvested','abandoned')), config TEXT, survey TEXT, generated_plan TEXT, phase_overrides TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
-- CREATE INDEX IF NOT EXISTS idx_grows_user_id ON grows(user_id, created_at DESC);

-- Per-plant log entries (notes + height + health). plant_id references a survey.strains[] entry id.
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

-- Buddy / read-only share links. Each user may have at most one active token.
CREATE TABLE IF NOT EXISTS share_tokens (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE,
  created_at TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Migration: CREATE TABLE IF NOT EXISTS share_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
