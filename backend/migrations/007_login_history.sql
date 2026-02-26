-- Migration 007: Login history tracking

-- Track last successful login time on the user record
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Full login history for the Access Logs admin page
CREATE TABLE IF NOT EXISTS login_history (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         NOT NULL REFERENCES users(id),
  logged_in_at timestamptz  NOT NULL DEFAULT now(),
  ip_address   text,
  user_agent   text
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history (user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_at   ON login_history (logged_in_at DESC);
