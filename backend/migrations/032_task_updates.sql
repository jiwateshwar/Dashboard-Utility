-- Migration 032: progress updates posted on a task (shown on the task's
-- detail page alongside its change history). Updates are append-only.
CREATE TABLE IF NOT EXISTS task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_updates_task_idx ON task_updates (task_id, created_at DESC);

-- The detail page reads a task's audit history in time order.
CREATE INDEX IF NOT EXISTS idx_audit_entity_time ON audit_log (entity_id, timestamp);
