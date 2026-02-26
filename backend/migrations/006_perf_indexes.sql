-- Migration 006: Performance indexes for 200-user scale

-- Composite index covering the most common task filters
CREATE INDEX IF NOT EXISTS idx_tasks_active
  ON tasks (dashboard_id, is_archived, status);

-- Partial index for target_date lookups (overdue / fortnight queries)
CREATE INDEX IF NOT EXISTS idx_tasks_target_date
  ON tasks (target_date) WHERE is_archived = false;

-- Composite index for task closure queries
CREATE INDEX IF NOT EXISTS idx_tasks_closure
  ON tasks (closure_approved_at) WHERE status = 'Closed Accepted';

-- Composite index covering common risk filters
CREATE INDEX IF NOT EXISTS idx_risks_active
  ON risks (dashboard_id, is_archived, status);

-- Composite index covering common decision filters
CREATE INDEX IF NOT EXISTS idx_decisions_active
  ON decisions (dashboard_id, is_archived, status);

-- Decision deadline lookups (overdue decisions)
CREATE INDEX IF NOT EXISTS idx_decisions_deadline
  ON decisions (decision_deadline) WHERE status = 'Pending';

-- Manager hierarchy traversal
CREATE INDEX IF NOT EXISTS idx_users_manager
  ON users (manager_id);

-- Dashboard access lookups by user
CREATE INDEX IF NOT EXISTS idx_da_user
  ON dashboard_access (user_id);

-- Dashboard owners lookups by user
CREATE INDEX IF NOT EXISTS idx_dbo_user
  ON dashboard_owners (user_id);

-- Publish flag + dashboard (used in hierarchy inheritance filters)
CREATE INDEX IF NOT EXISTS idx_tasks_published
  ON tasks (dashboard_id, publish_flag) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_risks_published
  ON risks (dashboard_id, publish_flag) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_decisions_published
  ON decisions (dashboard_id, publish_flag) WHERE is_archived = false;
