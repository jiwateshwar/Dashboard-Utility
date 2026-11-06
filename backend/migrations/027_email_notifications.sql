-- Email notifications.
--
-- email_settings: SMTP configuration, singleton row (id = 1), same pattern as
--   sso_settings — lazily seeded from SMTP_* env vars on first read, then the
--   DB is the source of truth and a SuperAdmin manages it from the UI. Email
--   stays off until a test send succeeds and a SuperAdmin enables it.
-- email_outbox: every email is queued here first and sent by a once-a-minute
--   worker, so a slow/down mail server never blocks an API request, failures
--   retry with backoff, and dedupe_key stops scheduled emails (digests,
--   weekly summaries) going out twice.
-- user_email_prefs: per-user opt-out per category (absent row = enabled).
-- users.email_digest_only: fold instant emails into the daily digest instead.

CREATE TABLE IF NOT EXISTS email_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  -- 'graph' = Microsoft Graph sendMail via the SSO App Registration (Mail.Send
  -- application permission); 'smtp' = any SMTP server / internal relay.
  transport text NOT NULL DEFAULT 'graph' CHECK (transport IN ('graph', 'smtp')),
  smtp_host text,
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_secure boolean NOT NULL DEFAULT false,          -- true = implicit TLS (465); false = STARTTLS
  smtp_user text,
  smtp_password text,
  tls_reject_unauthorized boolean NOT NULL DEFAULT true,
  from_address text,
  from_name text NOT NULL DEFAULT 'PRISM',
  app_base_url text,
  enabled boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT email_settings_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  category text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text NOT NULL,
  dedupe_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  send_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_dedupe ON email_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox (send_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox (created_at DESC);

CREATE TABLE IF NOT EXISTS user_email_prefs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest_only boolean NOT NULL DEFAULT false;
