-- Add expiry to publishing snapshots (180-day retention)
ALTER TABLE publishing_snapshots
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_only boolean NOT NULL DEFAULT false;

-- Back-fill existing rows: expire 180 days after creation
UPDATE publishing_snapshots
SET expires_at = created_at + interval '180 days'
WHERE expires_at IS NULL;

-- Make expires_at NOT NULL with a sensible default going forward
ALTER TABLE publishing_snapshots
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT now() + interval '180 days';

CREATE INDEX IF NOT EXISTS idx_snapshots_expires ON publishing_snapshots (expires_at);
