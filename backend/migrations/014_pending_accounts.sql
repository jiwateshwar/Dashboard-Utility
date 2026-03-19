ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
