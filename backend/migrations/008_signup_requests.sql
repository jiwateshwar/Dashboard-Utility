-- Migration 008: Self-signup request workflow

DO $$ BEGIN
  CREATE TYPE signup_status AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS signup_requests (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text          NOT NULL,
  email        text          NOT NULL,
  manager_id   uuid          REFERENCES users(id),
  requested_at timestamptz   NOT NULL DEFAULT now(),
  status       signup_status NOT NULL DEFAULT 'Pending',
  reviewed_by  uuid          REFERENCES users(id),
  reviewed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests (status);
