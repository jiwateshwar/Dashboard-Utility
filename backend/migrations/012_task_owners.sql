-- Junction table for task owners (supports multiple owners per task)
CREATE TABLE IF NOT EXISTS task_owners (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- Seed from existing owner_id so no data is lost
INSERT INTO task_owners (task_id, user_id)
SELECT id, owner_id FROM tasks
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_task_owners_task ON task_owners (task_id);
CREATE INDEX IF NOT EXISTS idx_task_owners_user ON task_owners (user_id);
