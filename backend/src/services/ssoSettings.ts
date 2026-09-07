import { query } from "../db.js";

export type SsoSettings = {
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

function rowToSettings(row: any): SsoSettings {
  return {
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    redirectUri: row.redirect_uri,
    enabled: row.enabled,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

async function ensureRow(): Promise<any> {
  const { rows } = await query(`SELECT * FROM sso_settings WHERE id = 1`);
  if (rows.length > 0) return rows[0];

  // First read after migration — seed the singleton row from the legacy
  // env vars (if this deployment had them set), so existing SSO behavior
  // isn't disrupted by the move to DB-backed config. Read exactly once.
  const tenantId = process.env.ENTRA_TENANT_ID || null;
  const clientId = process.env.ENTRA_CLIENT_ID || null;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET || null;
  const redirectUri = process.env.ENTRA_REDIRECT_URI || null;
  const enabled = !!(tenantId && clientId && clientSecret && redirectUri);

  const { rows: inserted } = await query(
    `INSERT INTO sso_settings (id, tenant_id, client_id, client_secret, redirect_uri, enabled)
     VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [tenantId, clientId, clientSecret, redirectUri, enabled]
  );
  if (inserted.length > 0) return inserted[0];

  // Lost a race with a concurrent first read — someone else just inserted it.
  const { rows: retried } = await query(`SELECT * FROM sso_settings WHERE id = 1`);
  return retried[0];
}

export async function getSsoSettings(): Promise<SsoSettings> {
  return rowToSettings(await ensureRow());
}

export async function isSsoEnabled(): Promise<boolean> {
  const s = await getSsoSettings();
  return !!(s.enabled && s.tenantId && s.clientId && s.clientSecret && s.redirectUri);
}

export async function saveSsoSettings(
  input: { tenantId: string; clientId: string; clientSecret?: string; redirectUri: string },
  updatedBy: string
): Promise<SsoSettings> {
  await ensureRow();
  // Saving always takes the config offline (enabled=false) and clears the
  // last test result — any credential change must pass a fresh connection
  // test before it can be made live again.
  const { rows } = await query(
    `UPDATE sso_settings SET
       tenant_id = $1,
       client_id = $2,
       client_secret = COALESCE(NULLIF($3, ''), client_secret),
       redirect_uri = $4,
       enabled = false,
       last_tested_at = NULL,
       last_test_ok = NULL,
       last_test_error = NULL,
       updated_at = now(),
       updated_by = $5
     WHERE id = 1
     RETURNING *`,
    [input.tenantId, input.clientId, input.clientSecret ?? "", input.redirectUri, updatedBy]
  );
  return rowToSettings(rows[0]);
}

export async function recordTestResult(ok: boolean, error: string | null): Promise<void> {
  await query(
    `UPDATE sso_settings SET last_tested_at = now(), last_test_ok = $1, last_test_error = $2 WHERE id = 1`,
    [ok, error]
  );
}

export async function setSsoEnabled(enabled: boolean, updatedBy: string): Promise<SsoSettings> {
  const { rows } = await query(
    `UPDATE sso_settings SET enabled = $1, updated_at = now(), updated_by = $2 WHERE id = 1 RETURNING *`,
    [enabled, updatedBy]
  );
  return rowToSettings(rows[0]);
}
