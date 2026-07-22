-- Migration 018: Weekly focus bucket for tasks (Monday date of the chosen week)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS focus_week_start date;

CREATE INDEX IF NOT EXISTS idx_tasks_focus_week ON tasks (focus_week_start);
