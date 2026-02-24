-- Multiple owners support for dashboards
CREATE TABLE IF NOT EXISTS dashboard_owners (
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dashboard_id, user_id)
);

-- Migrate existing primary owners
INSERT INTO dashboard_owners (dashboard_id, user_id)
SELECT id, primary_owner_id FROM dashboards WHERE primary_owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate existing secondary owners
INSERT INTO dashboard_owners (dashboard_id, user_id)
SELECT id, secondary_owner_id FROM dashboards WHERE secondary_owner_id IS NOT NULL
ON CONFLICT DO NOTHING;
