-- Dashboard hierarchy: each dashboard may link upward to a parent dashboard.
-- Items (tasks/risks/decisions) with publish_flag=true flow up to ancestors.
-- Maximum chain depth is enforced in application logic (3 levels).

ALTER TABLE dashboards
  ADD COLUMN IF NOT EXISTS parent_dashboard_id uuid REFERENCES dashboards(id) ON DELETE SET NULL;
