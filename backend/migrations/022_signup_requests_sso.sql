-- Allow signup_requests to carry an Entra identity so admin approval can
-- create the user + sso_identities link atomically for SSO-originated requests.

ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS sso_provider text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS sso_tenant_id text;
ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS sso_oid text;

-- Prevent duplicate pending requests from repeated SSO login attempts by the
-- same not-yet-approved Entra identity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_requests_pending_sso_oid
  ON signup_requests (sso_oid) WHERE status = 'Pending' AND sso_oid IS NOT NULL;
