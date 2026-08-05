-- Entra ID (Azure AD) SSO: identity linking between PRISM users and Entra accounts.

CREATE TABLE IF NOT EXISTS sso_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'entra',
  tenant_id text NOT NULL,
  oid text NOT NULL,
  email_at_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, tenant_id, oid),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_sso_identities_user ON sso_identities (user_id);

-- Distinguish OTP vs SSO logins in the existing access-log history.
ALTER TABLE login_history ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'otp';
DO $$ BEGIN
  ALTER TABLE login_history ADD CONSTRAINT login_history_method_check CHECK (method IN ('otp', 'sso'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
