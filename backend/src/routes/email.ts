import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isAdminRole } from "../services/permission.js";
import {
  EmailSettings,
  getEmailSettings,
  getAppBaseUrl,
  isComplete,
  recordEmailTestResult,
  saveEmailSettings,
  setEmailEnabled
} from "../services/emailSettings.js";
import { X509Certificate } from "crypto";
import { EMAIL_CATEGORIES, EmailCategory, processOutbox, sendTestEmail, isCertificateError, describeServerCertificate } from "../services/mailer.js";
import { renderEmail } from "../services/emailTemplates.js";
import { sendDailyDigests, sendWeeklySummaries } from "../services/digests.js";

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

// Never send the stored password back to the browser.
function toClient(s: EmailSettings) {
  return {
    transport: s.transport,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser,
    smtpPasswordSet: !!s.smtpPassword,
    tlsRejectUnauthorized: s.tlsRejectUnauthorized,
    tlsCaPem: s.tlsCaPem,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    appBaseUrl: s.appBaseUrl,
    enabled: s.enabled,
    lastTestedAt: s.lastTestedAt,
    lastTestOk: s.lastTestOk,
    lastTestError: s.lastTestError,
    updatedAt: s.updatedAt
  };
}

// ── SuperAdmin: SMTP settings ────────────────────────────────────

router.get("/settings", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  res.json(toClient(await getEmailSettings(true)));
});

router.put("/settings", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const b = req.body as any;
  const transport = b.transport === "smtp" ? "smtp" : "graph";
  const smtpHost = String(b.smtpHost ?? "").trim();
  const smtpPort = Number(b.smtpPort || 587);
  const fromAddress = String(b.fromAddress ?? "").trim();
  const appBaseUrl = String(b.appBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (!fromAddress || !appBaseUrl) {
    return res.status(400).json({ error: "From address and App URL are required" });
  }
  if (transport === "smtp" && !smtpHost) {
    return res.status(400).json({ error: "SMTP host is required" });
  }
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    return res.status(400).json({ error: "SMTP port must be a number between 1 and 65535" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
    return res.status(400).json({ error: "From address must be a valid email address" });
  }
  if (!/^https?:\/\/\S+$/.test(appBaseUrl)) {
    return res.status(400).json({ error: "App URL must start with http:// or https://" });
  }
  const tlsCaPem = String(b.tlsCaPem ?? "").trim();
  if (tlsCaPem) {
    const blocks = tlsCaPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
    if (blocks.length === 0) {
      return res.status(400).json({ error: "Trusted CA certificate must be PEM text starting with -----BEGIN CERTIFICATE-----" });
    }
    try { blocks.forEach((pem) => new X509Certificate(pem)); }
    catch { return res.status(400).json({ error: "Trusted CA certificate could not be read — paste the full PEM block(s)" }); }
  }
  const saved = await saveEmailSettings(
    {
      transport,
      smtpHost: smtpHost || null,
      smtpPort,
      smtpSecure: !!b.smtpSecure,
      smtpUser: String(b.smtpUser ?? "").trim() || null,
      smtpPassword: typeof b.smtpPassword === "string" ? b.smtpPassword : undefined,
      clearPassword: !!b.clearPassword,
      tlsRejectUnauthorized: b.tlsRejectUnauthorized !== false,
      tlsCaPem: tlsCaPem || null,
      fromAddress,
      fromName: String(b.fromName ?? "").trim() || "PRISM",
      appBaseUrl
    },
    req.session.userId!
  );
  res.json(toClient(saved));
});

// Sends a real email to the signed-in SuperAdmin (or `to`). Must pass before going live.
router.post("/settings/test", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const settings = await getEmailSettings(true);
  if (!isComplete(settings)) return res.status(400).json({ error: "Save a complete configuration before testing it" });
  const me = (await query(`SELECT name, email FROM users WHERE id = $1`, [req.session.userId])).rows[0];
  const to = String((req.body as any)?.to || me.email).trim();
  try {
    const baseUrl = await getAppBaseUrl();
    const { html, text } = renderEmail({
      heading: "Test email",
      intro: `This is a test email from PRISM, sent by ${me.name}. If you can read this, SMTP is configured correctly.\nLinks in emails will point to ${baseUrl}.`,
      ctaUrl: baseUrl,
      ctaLabel: "Open PRISM",
      baseUrl,
      showPrefsLink: false
    });
    await sendTestEmail(to, html, text);
    await recordEmailTestResult(true, null);
    res.json({ ok: true, to });
  } catch (err: any) {
    let message = String(err?.response || err?.message || "Test email failed");
    if (settings.transport === "smtp" && isCertificateError(err)) {
      message += "\n\n" + (await describeServerCertificate(settings)) +
        "\nFix: paste the issuing CA / intermediate certificate (PEM) into \"Trusted CA certificate\" and save.";
    }
    await recordEmailTestResult(false, String(message).slice(0, 1000));
    res.json({ ok: false, error: String(message) });
  }
});

router.post("/settings/enable", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { enabled } = req.body as { enabled?: boolean };
  if (enabled) {
    const s = await getEmailSettings(true);
    if (!isComplete(s)) return res.status(400).json({ error: "Save a complete configuration before going live" });
    if (s.lastTestOk !== true) return res.status(400).json({ error: "Send a successful test email before going live" });
  }
  res.json(toClient(await setEmailEnabled(!!enabled, req.session.userId!)));
});

// ── SuperAdmin: outbox monitoring ────────────────────────────────

router.get("/outbox", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const status = (req.query.status as string) || null;
  const [counts, recent] = await Promise.all([
    query(
      `SELECT status, count(*)::int AS count FROM email_outbox
       WHERE created_at > now() - interval '7 days' GROUP BY status`
    ),
    query(
      `SELECT id, to_email, category, subject, status, attempts, last_error, created_at, sent_at
       FROM email_outbox
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC LIMIT 100`,
      [status]
    )
  ]);
  res.json({
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])),
    recent: recent.rows
  });
});

router.post("/outbox/:id/retry", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  await query(
    `UPDATE email_outbox SET status = 'pending', attempts = 0, send_after = now(), last_error = NULL
     WHERE id = $1 AND status = 'failed'`,
    [req.params.id]
  );
  void processOutbox();
  res.json({ ok: true });
});

// Sends this user's own digest / weekly summary right now, so a SuperAdmin
// can see exactly what users will receive.
router.post("/preview/:kind", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const userId = req.session.userId!;
  const s = await getEmailSettings(true);
  if (!s.enabled) return res.status(400).json({ error: "Email must be live to send a preview" });
  const kind = req.params.kind;
  let sent = 0;
  if (kind === "digest") sent = await sendDailyDigests({ onlyUserId: userId, force: true });
  else if (kind === "weekly") sent = await sendWeeklySummaries({ onlyUserId: userId, force: true });
  else return res.status(400).json({ error: "Unknown preview" });
  void processOutbox();
  res.json({
    ok: true,
    sent,
    message: sent
      ? "Queued — it should arrive within a minute."
      : "Nothing to send: you have no items for this email, or you've turned this category off in your preferences."
  });
});

// ── Any user: own preferences ────────────────────────────────────

async function visibleCategories(userId: string): Promise<EmailCategory[]> {
  const role = await getUserRole(userId);
  return (Object.keys(EMAIL_CATEGORIES) as EmailCategory[]).filter((c) => {
    if (c === "admin_requests") return isAdminRole(role);
    if (c === "system") return role === "SuperAdmin";
    if (c === "account") return false; // only relevant before someone has an account
    return true;
  });
}

router.get("/preferences", async (req, res) => {
  const userId = req.session.userId!;
  const cats = await visibleCategories(userId);
  const [prefs, user, settings] = await Promise.all([
    query(`SELECT category, enabled FROM user_email_prefs WHERE user_id = $1`, [userId]),
    query(`SELECT email, email_digest_only FROM users WHERE id = $1`, [userId]),
    getEmailSettings()
  ]);
  const map = new Map(prefs.rows.map((r) => [r.category, r.enabled]));
  res.json({
    emailLive: settings.enabled && isComplete(settings),
    email: user.rows[0]?.email,
    digestOnly: !!user.rows[0]?.email_digest_only,
    categories: cats.map((key) => ({
      key,
      ...EMAIL_CATEGORIES[key],
      enabled: EMAIL_CATEGORIES[key].mandatory ? true : map.get(key) ?? true
    }))
  });
});

router.put("/preferences", async (req, res) => {
  const userId = req.session.userId!;
  const { categories, digestOnly } = req.body as { categories?: Record<string, boolean>; digestOnly?: boolean };
  const allowed = new Set(await visibleCategories(userId));
  if (categories && typeof categories === "object") {
    for (const [key, enabled] of Object.entries(categories)) {
      if (!allowed.has(key as EmailCategory) || EMAIL_CATEGORIES[key as EmailCategory].mandatory) continue;
      await query(
        `INSERT INTO user_email_prefs (user_id, category, enabled) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, category) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [userId, key, !!enabled]
      );
    }
  }
  if (typeof digestOnly === "boolean") {
    await query(`UPDATE users SET email_digest_only = $2 WHERE id = $1`, [userId, digestOnly]);
  }
  res.json({ ok: true });
});

export default router;
