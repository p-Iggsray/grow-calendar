-- 0001_multi_tenant.sql
-- One-time migration. NOT re-runnable (table rebuilds). Take a backup first.
-- Preserves the existing owner (lowest user id), their plan_config row, and
-- their plan_day_overrides. task_checkoffs and day_notes are untouched.

-- 1. users gains role + status (additive; existing rows backfill with defaults)
ALTER TABLE users ADD COLUMN role   TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- 2. promote the original owner
UPDATE users SET role = 'admin', status = 'approved'
WHERE id = (SELECT MIN(id) FROM users);

-- 3. plan_config -> per-user (rebuild: drop CHECK(id=1) + change PK)
CREATE TABLE plan_config_new (
  user_id    INTEGER PRIMARY KEY,
  config     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO plan_config_new (user_id, config, updated_at)
SELECT (SELECT MIN(id) FROM users), config, updated_at
FROM plan_config WHERE id = 1;
DROP TABLE plan_config;
ALTER TABLE plan_config_new RENAME TO plan_config;

-- 4. plan_day_overrides -> per-user (rebuild: composite PK)
CREATE TABLE plan_day_overrides_new (
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO plan_day_overrides_new (user_id, date, payload, updated_at)
SELECT (SELECT MIN(id) FROM users), date, payload, updated_at
FROM plan_day_overrides;
DROP TABLE plan_day_overrides;
ALTER TABLE plan_day_overrides_new RENAME TO plan_day_overrides;

-- 5. per-user daily MJ usage counter (used by a later plan; created now)
CREATE TABLE IF NOT EXISTS mj_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
