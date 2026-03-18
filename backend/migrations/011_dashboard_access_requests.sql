CREATE TABLE IF NOT EXISTS dashboard_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (dashboard_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dar_dashboard ON dashboard_access_requests(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dar_user ON dashboard_access_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_dar_status ON dashboard_access_requests(status);
