CREATE TABLE IF NOT EXISTS dashboard_delete_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  uuid NOT NULL REFERENCES dashboards(id),
  requested_by  uuid NOT NULL REFERENCES users(id),
  reason        text,
  status        text NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by   uuid REFERENCES users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only one pending request per dashboard at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_delete_pending
  ON dashboard_delete_requests (dashboard_id)
  WHERE status = 'Pending';
