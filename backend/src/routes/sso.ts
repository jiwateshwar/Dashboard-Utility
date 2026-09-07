import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getUserRole } from "../services/permission.js";
import {
  getSsoSettings,
  saveSsoSettings,
  recordTestResult,
  setSsoEnabled,
  SsoSettings
} from "../services/ssoSettings.js";
import { testEntraConnection, invalidateEntraConfig } from "../services/entra.js";

const router = Router();
router.use(requireAuth);

async function requireSuperAdmin(req: any, res: any): Promise<boolean> {
  const role = await getUserRole(req.session.userId!);
  if (role !== "SuperAdmin") {
    res.status(403).json({ error: "SuperAdmin only" });
    return false;
  }
  return true;
}

// Never send the raw secret back to the browser once it's saved.
function toClient(settings: SsoSettings) {
  return {
    tenantId: settings.tenantId,
    clientId: settings.clientId,
    clientSecretSet: !!settings.clientSecret,
    redirectUri: settings.redirectUri,
    enabled: settings.enabled,
    lastTestedAt: settings.lastTestedAt,
    lastTestOk: settings.lastTestOk,
    lastTestError: settings.lastTestError,
    updatedAt: settings.updatedAt
  };
}

router.get("/entra", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  res.json(toClient(await getSsoSettings()));
});

router.put("/entra", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { tenantId, clientId, clientSecret, redirectUri } = req.body as {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  };
  if (!tenantId?.trim() || !clientId?.trim() || !redirectUri?.trim()) {
    return res.status(400).json({ error: "Tenant ID, Client ID and Redirect URI are required" });
  }

  const existing = await getSsoSettings();
  if (!clientSecret?.trim() && !existing.clientSecret) {
    return res.status(400).json({ error: "Client secret is required" });
  }

  const saved = await saveSsoSettings(
    {
      tenantId: tenantId.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret?.trim(),
      redirectUri: redirectUri.trim()
    },
    req.session.userId!
  );
  invalidateEntraConfig();
  res.json(toClient(saved));
});

// Validates the currently-saved config against Entra ID without going live.
// Must pass before /enable will allow enabled=true.
router.post("/entra/test", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const settings = await getSsoSettings();
  if (!(settings.tenantId && settings.clientId && settings.clientSecret && settings.redirectUri)) {
    return res.status(400).json({ error: "Save a complete configuration before testing it" });
  }
  try {
    await testEntraConnection(settings.tenantId, settings.clientId, settings.clientSecret);
    await recordTestResult(true, null);
    res.json({ ok: true });
  } catch (err: any) {
    const message = err?.error_description || err?.message || "Connection test failed";
    await recordTestResult(false, message);
    res.json({ ok: false, error: message });
  }
});

router.post("/entra/enable", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { enabled } = req.body as { enabled?: boolean };

  if (enabled) {
    const settings = await getSsoSettings();
    if (!(settings.tenantId && settings.clientId && settings.clientSecret && settings.redirectUri)) {
      return res.status(400).json({ error: "Save a complete configuration before going live" });
    }
    if (settings.lastTestOk !== true) {
      return res.status(400).json({ error: "Run a successful connection test before going live" });
    }
  }

  const saved = await setSsoEnabled(!!enabled, req.session.userId!);
  invalidateEntraConfig();
  res.json(toClient(saved));
});

export default router;
