-- Migration 019: Hashtags on tasks (multiple per task, free-form)
CREATE TABLE IF NOT EXISTS task_tags (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags (lower(tag));
