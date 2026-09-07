-- Moves Entra ID (Azure AD) SSO configuration out of env-vars-only and into
-- the database, so a SuperAdmin can configure/test/enable it from the UI
-- instead of needing a redeploy. Singleton row (id is always 1).
--
-- The row is lazily seeded on first read (see services/ssoSettings.ts) from
-- the legacy ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI env vars,
-- if present, so a deployment that already had SSO working via env vars
-- keeps working unchanged. From then on the DB is the sole source of truth.

CREATE TABLE IF NOT EXISTS sso_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  tenant_id text,
  client_id text,
  client_secret text,
  redirect_uri text,
  enabled boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT sso_settings_singleton CHECK (id = 1)
);
