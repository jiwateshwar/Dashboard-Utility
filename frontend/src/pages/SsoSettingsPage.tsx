import { useEffect, useState } from "react";
import { api } from "../api";

type SsoSettings = {
  tenantId: string | null;
  clientId: string | null;
  clientSecretSet: boolean;
  redirectUri: string | null;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
};

const defaultRedirectUri = `${window.location.origin}/api/auth/entra/callback`;

export default function SsoSettingsPage() {
  const [me, setMe] = useState<any>(null);
  const [settings, setSettings] = useState<SsoSettings | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function load() {
    try {
      const [meData, sso] = await Promise.all([api("/auth/me"), api("/sso/entra")]);
      setMe(meData);
      applySettings(sso);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function applySettings(sso: SsoSettings) {
    setSettings(sso);
    setTenantId(sso.tenantId ?? "");
    setClientId(sso.clientId ?? "");
    setClientSecret("");
    setRedirectUri(sso.redirectUri ?? defaultRedirectUri);
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const body: any = { tenantId: tenantId.trim(), clientId: clientId.trim(), redirectUri: redirectUri.trim() };
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      const saved = await api("/sso/entra", { method: "PUT", body: JSON.stringify(body) });
      applySettings(saved);
      setNotice("Saved. Run a connection test before going live.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError(null);
    setNotice(null);
    setTesting(true);
    try {
      const result = await api("/sso/entra/test", { method: "POST" });
      const sso = await api("/sso/entra");
      applySettings(sso);
      if (result.ok) {
        setNotice("Connection test passed — you can now go live.");
      } else {
        setError(result.error || "Connection test failed");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleToggleLive(enabled: boolean) {
    setError(null);
    setNotice(null);
    setToggling(true);
    try {
      const saved = await api("/sso/entra/enable", { method: "POST", body: JSON.stringify({ enabled }) });
      applySettings(saved);
      setNotice(enabled ? "SSO is now live." : "SSO taken offline.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  }

  if (me && me.role !== "SuperAdmin") {
    return <div className="card">SuperAdmin access required.</div>;
  }

  const isComplete = !!(tenantId.trim() && clientId.trim() && redirectUri.trim() && (clientSecret.trim() || settings?.clientSecretSet));
  const savedComplete = !!(settings?.tenantId && settings?.clientId && settings?.clientSecretSet && settings?.redirectUri);
  const canGoLive = savedComplete && settings?.lastTestOk === true;

  const statusLabel = settings?.enabled ? "Live" : savedComplete ? "Configured, not live" : "Not configured";
  const statusColor = settings?.enabled ? "#2ebd85" : savedComplete ? "#d97706" : "var(--muted)";

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Entra ID (Azure AD) SSO</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        Let users sign in with their Microsoft work account instead of (or in addition to) the
        email + employee ID flow. Configure your Azure App Registration's details below, run a
        connection test, then go live.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Status:</span>
        <span className="badge" style={{ color: statusColor }}>{statusLabel}</span>
        {settings?.updatedAt && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            · last saved {new Date(settings.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ color: "#2ebd85", marginBottom: 12 }}>{notice}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px 0" }}>App Registration</h3>

          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Tenant ID (Directory ID)</label>
          <input
            className="input"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            style={{ marginBottom: 12, width: "100%", maxWidth: 480 }}
          />

          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Client ID (Application ID)</label>
          <input
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            style={{ marginBottom: 12, width: "100%", maxWidth: 480 }}
          />

          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Client Secret</label>
          <input
            className="input"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={settings?.clientSecretSet ? "•••••••• (unchanged — enter a new value to replace it)" : "Client secret value"}
            style={{ marginBottom: 12, width: "100%", maxWidth: 480 }}
          />

          <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Redirect URI</label>
          <input
            className="input"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            style={{ marginBottom: 6, width: "100%", maxWidth: 480 }}
          />
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, maxWidth: 480 }}>
            Register this exact URL as a redirect URI on the App Registration in Azure — it must match
            character-for-character, including the protocol and port.
          </p>

          <button className="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Test Connection</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Verifies the tenant ID, client ID and client secret are valid together, without signing
            anyone in. Required at least once since the last save before you can go live.
          </p>
          <button className="button secondary" onClick={handleTest} disabled={!savedComplete || testing}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          {settings?.lastTestedAt && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              Last tested {new Date(settings.lastTestedAt).toLocaleString()} —{" "}
              <span style={{ color: settings.lastTestOk ? "#2ebd85" : "#ef6a62" }}>
                {settings.lastTestOk ? "passed" : "failed"}
              </span>
              {!settings.lastTestOk && settings.lastTestError && (
                <div style={{ color: "#ef6a62", marginTop: 4 }}>{settings.lastTestError}</div>
              )}
            </div>
          )}
          {!savedComplete && isComplete && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>Save the configuration first.</div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Go Live</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            {settings?.enabled
              ? "SSO is live — the \"Sign in with Microsoft\" option is visible on the login page."
              : "Once a connection test has passed, make this configuration live for everyone."}
          </p>
          {settings?.enabled ? (
            <button className="button danger" onClick={() => handleToggleLive(false)} disabled={toggling}>
              {toggling ? "Working…" : "Take Offline"}
            </button>
          ) : (
            <button className="button" onClick={() => handleToggleLive(true)} disabled={!canGoLive || toggling}>
              {toggling ? "Working…" : "Go Live"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
