-- Migration 020: richer notifications so the Notifications page can distinguish
-- types and link back to the task/dashboard that triggered them.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dashboard_id uuid REFERENCES dashboards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
