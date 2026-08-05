import * as client from "openid-client";
import { env } from "../utils/env.js";

// Cached tenant discovery document — avoids a network round-trip per login.
let config: client.Configuration | null = null;

async function getConfig(): Promise<client.Configuration> {
  if (!env.entra.enabled) {
    throw new Error("Entra ID SSO is not configured");
  }
  if (config) return config;
  config = await client.discovery(
    new URL(`https://login.microsoftonline.com/${env.entra.tenantId}/v2.0`),
    env.entra.clientId!,
    { client_secret: env.entra.clientSecret! }
  );
  return config;
}

export type EntraAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export async function buildLoginRedirect(): Promise<{ url: string; authState: EntraAuthState }> {
  const cfg = await getConfig();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = client.buildAuthorizationUrl(cfg, {
    redirect_uri: env.entra.redirectUri!,
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
  const cfg = await getConfig();
  const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
    expectedState: authState.state,
    expectedNonce: authState.nonce,
    pkceCodeVerifier: authState.codeVerifier
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("No ID token claims returned by Entra ID");
  return claims as EntraClaims;
}
