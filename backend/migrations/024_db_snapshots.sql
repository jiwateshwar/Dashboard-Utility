-- Full-database snapshots: shared engine backing both cross-host migration
-- (manual export/import) and the weekly automatic snapshot + SuperAdmin rollback.
-- Deliberately separate from the unrelated `publishing_snapshots` table, which
-- is a per-dashboard content export for stakeholder emails, not a DB backup.

DO $$ BEGIN
  CREATE TYPE db_snapshot_trigger AS ENUM ('weekly', 'manual_export', 'pre_rollback_safety', 'import');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE db_snapshot_status AS ENUM ('in_progress', 'complete', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS db_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  trigger_type db_snapshot_trigger NOT NULL,
  status db_snapshot_status NOT NULL DEFAULT 'in_progress',
  file_path text,
  size_bytes bigint,
  schema_migration_count int,
  schema_last_migration text,
  table_row_counts jsonb,
  error_message text,
  restored_from_id uuid REFERENCES db_snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_db_snapshots_trigger_created ON db_snapshots (trigger_type, created_at DESC);
