import * as client from "openid-client";
import { getSsoSettings, SsoSettings } from "./ssoSettings.js";

// Cached tenant discovery document, keyed by the credential triple that
// produced it — avoids a network round-trip per login, without ever serving
// a stale document after a SuperAdmin changes the configuration (call
// invalidateEntraConfig() after any save).
let cached: { key: string; config: client.Configuration } | null = null;

function cacheKey(s: Pick<SsoSettings, "tenantId" | "clientId" | "clientSecret">) {
  return `${s.tenantId}::${s.clientId}::${s.clientSecret}`;
}

export function invalidateEntraConfig() {
  cached = null;
}

async function discoverConfig(tenantId: string, clientId: string, clientSecret: string) {
  return client.discovery(
    new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`),
    clientId,
    { client_secret: clientSecret }
  );
}

async function getConfig(): Promise<{ cfg: client.Configuration; settings: SsoSettings }> {
  const settings = await getSsoSettings();
  if (!(settings.enabled && settings.tenantId && settings.clientId && settings.clientSecret && settings.redirectUri)) {
    throw new Error("Entra ID SSO is not configured");
  }
  const key = cacheKey(settings);
  if (cached && cached.key === key) return { cfg: cached.config, settings };
  const config = await discoverConfig(settings.tenantId, settings.clientId, settings.clientSecret);
  cached = { key, config };
  return { cfg: config, settings };
}

export type EntraAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export async function buildLoginRedirect(): Promise<{ url: string; authState: EntraAuthState }> {
  const { cfg, settings } = await getConfig();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = client.buildAuthorizationUrl(cfg, {
    redirect_uri: settings.redirectUri!,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return {
    url: redirectTo.href,
    authState: { state, nonce, codeVerifier, createdAt: Date.now() }
  };
}

export type EntraClaims = {
  sub: string;
  oid?: string;
  tid?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
};

export async function exchangeCode(currentUrl: URL, authState: EntraAuthState): Promise<EntraClaims> {
  const { cfg } = await getConfig();
  const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
    expectedState: authState.state,
    expectedNonce: authState.nonce,
    pkceCodeVerifier: authState.codeVerifier
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("No ID token claims returned by Entra ID");
  return claims as EntraClaims;
}

// Validates a tenant/client/secret triple without a user login — used by the
// SuperAdmin "Test Connection" action before a config can go live. Discovery
// alone only confirms the tenant ID resolves to a real Entra tenant;
// exchanging for an app-only token additionally confirms the client_id and
// client_secret are actually valid for that tenant (Entra issues this token
// regardless of whether any Graph app permissions were granted, so it works
// as a pure credential check).
export async function testEntraConnection(tenantId: string, clientId: string, clientSecret: string): Promise<void> {
  const cfg = await discoverConfig(tenantId, clientId, clientSecret);
  await client.clientCredentialsGrant(cfg, { scope: "https://graph.microsoft.com/.default" });
}
