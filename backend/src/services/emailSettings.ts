import { query } from "../db.js";
import { env } from "../utils/env.js";

export type EmailTransport = "graph" | "smtp";

export type EmailSettings = {
  transport: EmailTransport;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassword: string | null;
  tlsRejectUnauthorized: boolean;
  tlsCaPem: string | null;
  fromAddress: string | null;
  fromName: string;
  appBaseUrl: string | null;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
};

function rowToSettings(row: any): EmailSettings {
  return {
    transport: row.transport,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: row.smtp_secure,
    smtpUser: row.smtp_user,
    smtpPassword: row.smtp_password,
    tlsRejectUnauthorized: row.tls_reject_unauthorized,
    tlsCaPem: row.tls_ca_pem ?? null,
    fromAddress: row.from_address,
    fromName: row.from_name,
    appBaseUrl: row.app_base_url,
    enabled: row.enabled,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    updatedAt: row.updated_at
  };
}

/** Prefer a hostname-based origin (e.g. https://prism.comviva.com) over a raw IP for links in emails. */
function defaultBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const named = env.corsOrigins.find((o) => !/^https?:\/\/(\d+\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1)(:|\/|$)/.test(o));
  return named || env.corsOrigins[0] || "http://localhost:5173";
}

async function ensureRow(): Promise<any> {
  const { rows } = await query(`SELECT * FROM email_settings WHERE id = 1`);
  if (rows.length > 0) return rows[0];

  // First read after migration — seed from SMTP_* env vars if present.
  // Never enabled automatically: a SuperAdmin must send a test email first.
  const { rows: inserted } = await query(
    `INSERT INTO email_settings
       (id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_address, from_name, app_base_url, transport)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      process.env.SMTP_HOST || null,
      Number(process.env.SMTP_PORT || 587),
      process.env.SMTP_SECURE === "true",
      process.env.SMTP_USER || null,
      process.env.SMTP_PASSWORD || null,
      process.env.MAIL_FROM || null,
      process.env.MAIL_FROM_NAME || "PRISM",
      defaultBaseUrl(),
      process.env.EMAIL_TRANSPORT === "smtp" || (!process.env.EMAIL_TRANSPORT && process.env.SMTP_HOST) ? "smtp" : "graph"
    ]
  );
  if (inserted.length > 0) return inserted[0];
  const { rows: retried } = await query(`SELECT * FROM email_settings WHERE id = 1`);
  return retried[0];
}

// Checked on every notification, so cache briefly instead of a query each time.
let cache: { value: EmailSettings; at: number } | null = null;
const CACHE_MS = 30_000;

export async function getEmailSettings(fresh = false): Promise<EmailSettings> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = rowToSettings(await ensureRow());
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateEmailSettings() {
  cache = null;
}

export function isComplete(s: EmailSettings): boolean {
  if (!s.fromAddress) return false;
  return s.transport === "graph" ? true : !!(s.smtpHost && s.smtpPort);
}

export async function isEmailLive(): Promise<boolean> {
  const s = await getEmailSettings();
  return s.enabled && isComplete(s);
}

export async function getAppBaseUrl(): Promise<string> {
  const s = await getEmailSettings();
  return (s.appBaseUrl || defaultBaseUrl()).replace(/\/+$/, "");
}

export async function saveEmailSettings(
  input: {
    transport: EmailTransport;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpPassword?: string;
    clearPassword?: boolean;
    tlsRejectUnauthorized: boolean;
    tlsCaPem?: string | null;
    fromAddress: string;
    fromName: string;
    appBaseUrl: string;
  },
  updatedBy: string
): Promise<EmailSettings> {
  await ensureRow();
  // Like SSO: any change takes email offline until a fresh test send passes.
  const { rows } = await query(
    `UPDATE email_settings SET
       smtp_host = $1,
       smtp_port = $2,
       smtp_secure = $3,
       smtp_user = $4,
       smtp_password = CASE WHEN $10 THEN NULL ELSE COALESCE(NULLIF($5, ''), smtp_password) END,
       tls_reject_unauthorized = $6,
       from_address = $7,
       from_name = $8,
       app_base_url = $9,
       transport = $12,
       tls_ca_pem = $13,
       enabled = false,
       last_tested_at = NULL,
       last_test_ok = NULL,
       last_test_error = NULL,
       updated_at = now(),
       updated_by = $11
     WHERE id = 1
     RETURNING *`,
    [
      input.smtpHost,
      input.smtpPort,
      input.smtpSecure,
      input.smtpUser,
      input.smtpPassword ?? "",
      input.tlsRejectUnauthorized,
      input.fromAddress,
      input.fromName,
      input.appBaseUrl,
      !!input.clearPassword,
      updatedBy,
      input.transport,
      input.tlsCaPem ?? null
    ]
  );
  invalidateEmailSettings();
  return rowToSettings(rows[0]);
}

export async function recordEmailTestResult(ok: boolean, error: string | null): Promise<void> {
  await query(
    `UPDATE email_settings SET last_tested_at = now(), last_test_ok = $1, last_test_error = $2 WHERE id = 1`,
    [ok, error]
  );
  invalidateEmailSettings();
}

export async function setEmailEnabled(enabled: boolean, updatedBy: string): Promise<EmailSettings> {
  const { rows } = await query(
    `UPDATE email_settings SET enabled = $1, updated_at = now(), updated_by = $2 WHERE id = 1 RETURNING *`,
    [enabled, updatedBy]
  );
  invalidateEmailSettings();
  return rowToSettings(rows[0]);
}
