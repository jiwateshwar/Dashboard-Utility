-- Escalations: "Request update" emails the people a task/risk/decision is
-- pending on, with the manager in CC.
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS cc_emails text[];
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS reply_to text;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS update_requested_at timestamptz;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS update_requested_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Access log: when a user was last actually active in the app (any page
-- view, scroll or click), not just when they last signed in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- Site analytics: one row per user per dashboard per day they viewed it.
-- Small and bounded (users x dashboards x days); enough for weekly unique
-- visitor counts without storing every page hit.
CREATE TABLE IF NOT EXISTS dashboard_visits (
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  view_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, user_id, visit_date)
);
CREATE INDEX IF NOT EXISTS dashboard_visits_date_idx ON dashboard_visits (visit_date);

-- Escalations re-fire nightly and grow by thousands of rows a month; these
-- keep "Escalated to you", the per-dashboard log and the update-request
-- cooldown lookup fast.
CREATE INDEX IF NOT EXISTS escalations_notified_created_idx ON escalations (notified_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS escalations_dashboard_created_idx ON escalations (dashboard_id, created_at DESC);
CREATE INDEX IF NOT EXISTS escalations_entity_idx ON escalations (entity_id);
