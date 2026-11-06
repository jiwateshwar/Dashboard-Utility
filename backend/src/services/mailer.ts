import net from "net";
import tls from "tls";
import nodemailer, { Transporter } from "nodemailer";
import { query } from "../db.js";
import { EmailSettings, getEmailSettings, isComplete, isEmailLive } from "./emailSettings.js";
import { getGraphAppToken } from "./entra.js";

// ── Categories ───────────────────────────────────────────────────
// What a user can opt out of on their Profile page. Mandatory categories
// can't be turned off (and ignore digest-only mode).

export const EMAIL_CATEGORIES = {
  assignments: { label: "Assignments", description: "A task or decision is assigned to you, or you're made a dashboard owner / given access", mandatory: false, instant: true },
  approvals: { label: "Approvals waiting on you", description: "Task closure requests, new decisions and access requests that need your approval", mandatory: false, instant: true },
  outcomes: { label: "Outcomes of your requests", description: "Your closure, access, delete or account requests were approved or rejected", mandatory: false, instant: true },
  critical_risks: { label: "Critical risks", description: "A risk on a dashboard you own is raised to Critical", mandatory: false, instant: true },
  admin_requests: { label: "Admin requests", description: "New signup, account and dashboard-delete requests (admins only)", mandatory: false, instant: true },
  daily_digest: { label: "Daily digest", description: "Weekday morning summary: overdue, due soon, waiting on you, escalations", mandatory: false, instant: false },
  weekly_summary: { label: "Weekly summary", description: "Monday summary of your dashboards, your team and (admins) pending queues", mandatory: false, instant: false },
  publishing: { label: "Publishing cycle", description: "Reminder before the 15th / month-end publishing cycle, and when child dashboards are published", mandatory: false, instant: false },
  system: { label: "System alerts", description: "Scheduled job failures (SuperAdmins only)", mandatory: true, instant: true },
  account: { label: "Account access", description: "Your signup request was approved or rejected", mandatory: true, instant: true }
} as const;

export type EmailCategory = keyof typeof EMAIL_CATEGORIES;

// ── Transport ────────────────────────────────────────────────────

let transporter: { key: string; t: Transporter } | null = null;

function transportKey(s: EmailSettings) {
  return [s.smtpHost, s.smtpPort, s.smtpSecure, s.smtpUser, s.smtpPassword, s.tlsRejectUnauthorized, s.tlsCaPem].join("|");
}

function getTransport(s: EmailSettings): Transporter {
  const key = transportKey(s);
  if (transporter && transporter.key === key) return transporter.t;
  transporter?.t.close();
  const t = nodemailer.createTransport({
    host: s.smtpHost!,
    port: s.smtpPort,
    secure: s.smtpSecure,
    requireTLS: !s.smtpSecure && s.smtpPort === 587,
    auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassword ?? "" } : undefined,
    // Extra CA PEMs are added to (not substituted for) Node's public roots.
    tls: {
      rejectUnauthorized: s.tlsRejectUnauthorized,
      ...(s.tlsCaPem?.trim() ? { ca: [...tls.rootCertificates, s.tlsCaPem] } : {})
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    pool: true,
    maxConnections: 2
  });
  transporter = { key, t };
  return t;
}

function fromHeader(s: EmailSettings) {
  return { name: s.fromName || "PRISM", address: s.fromAddress! };
}

type Message = { to: string; subject: string; html: string; text: string };

/** Microsoft Graph sendMail as the From mailbox (needs Mail.Send application permission). */
async function sendViaGraph(s: EmailSettings, m: Message): Promise<void> {
  const token = await getGraphAppToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(s.fromAddress!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: [{ emailAddress: { address: m.to } }],
        from: { emailAddress: { address: s.fromAddress, name: s.fromName || "PRISM" } }
      },
      saveToSentItems: false
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    const code = body?.error?.code ? `${body.error.code}: ` : "";
    let hint = "";
    if (res.status === 403) hint = " — grant the App Registration the Mail.Send application permission (admin consent) and allow it to send as this mailbox";
    if (res.status === 404) hint = " — the From address must be an existing mailbox in the tenant";
    throw new Error(`Graph sendMail failed (HTTP ${res.status}) ${code}${body?.error?.message ?? res.statusText}${hint}`);
  }
}

async function deliver(s: EmailSettings, m: Message): Promise<void> {
  if (s.transport === "graph") return sendViaGraph(s, m);
  await getTransport(s).sendMail({ from: fromHeader(s), ...m });
}

/** Sends immediately, bypassing the outbox. Only for the settings-page test. */
const CERT_ERROR = /certificate|UNABLE_TO_VERIFY|SELF_SIGNED|CERT_|ALTNAME/i;
export const isCertificateError = (err: any) => CERT_ERROR.test(`${err?.code ?? ""} ${err?.message ?? ""}`);

/**
 * Diagnostic for a failed test: describes the certificate chain the SMTP
 * server presents to *this* host, so an admin can see why verification
 * failed. It only reads the chain after EHLO/STARTTLS and sends nothing
 * else (no login, no mail); the connection is closed straight away.
 */
export function describeServerCertificate(s: EmailSettings): Promise<string> {
  return new Promise((resolve) => {
    const host = s.smtpHost!;
    let tlsSock: tls.TLSSocket | null = null;
    let finished = false;
    // Close only the outermost socket: destroying the raw socket under a live
    // TLS socket (and then the TLS socket) crashes Node with a segfault.
    const done = (msg: string) => {
      if (finished) return;
      finished = true;
      resolve(msg);
      setImmediate(() => { try { (tlsSock ?? sock).destroy(); } catch { /* ignore */ } });
    };
    const inspect = (t: tls.TLSSocket) => {
      const lines: string[] = [];
      let c: any = t.getPeerCertificate(true);
      let single: any = c;
      const seen = new Set<string>();
      while (c && c.fingerprint256 && !seen.has(c.fingerprint256)) {
        seen.add(c.fingerprint256);
        lines.push(`${lines.length + 1}. ${c.subject?.CN ?? "?"} (issued by ${c.issuer?.CN ?? "?"}${c.issuer?.O ? ", " + c.issuer.O : ""}; valid to ${c.valid_to})`);
        c = c.issuerCertificate;
      }
      const selfSigned = lines.length === 1 && single?.subject?.CN === single?.issuer?.CN;
      const note = t.authorizationError ? `Verification result: ${t.authorizationError}\n` : "";
      done(`Certificate chain presented by ${host} to this server:\n${lines.join("\n")}\n${note}` +
        (selfSigned ? "The certificate is self-signed." : lines.length === 1 ? "Only one certificate was sent, so its issuer (intermediate) certificate is missing." : ""));
    };
    const wrap = (raw: net.Socket) => {
      // rejectUnauthorized:false only so the chain can be *read* for this report; nothing is sent over it.
      tlsSock = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false }, () => inspect(tlsSock!));
      tlsSock.on("error", (e) => done(`Could not read the certificate: ${e.message}`));
    };
    const sock = net.connect(s.smtpPort, host);
    sock.setTimeout(10_000, () => done("Could not read the certificate: timed out"));
    sock.on("error", (e) => done(`Could not read the certificate: ${e.message}`));
    if (s.smtpSecure) { sock.once("connect", () => wrap(sock)); return; }
    let buf = "", stage = 0;
    const onData = (d: Buffer) => {
      buf += d.toString();
      if (!/(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buf)) return;
      const reply = buf; buf = "";
      if (stage === 0) { sock.write("EHLO prism\r\n"); stage = 1; }
      else if (stage === 1) { sock.write("STARTTLS\r\n"); stage = 2; }
      else { sock.off("data", onData); if (!reply.startsWith("220")) return done(`Server refused STARTTLS: ${reply.trim()}`); wrap(sock); }
    };
    sock.on("data", onData);
  });
}

export async function sendTestEmail(to: string, html: string, text: string): Promise<void> {
  const s = await getEmailSettings(true);
  if (!isComplete(s)) throw new Error("Save the configuration (including the From address) first");
  if (s.transport === "smtp") await getTransport(s).verify();
  await deliver(s, { to, subject: "[PRISM] Test email", html, text });
}

// ── Outbox ───────────────────────────────────────────────────────

export type OutgoingEmail = {
  to: string;
  userId?: string | null;
  category: EmailCategory;
  subject: string;
  html: string;
  text: string;
  dedupeKey?: string;
};

/** Queues an email. No-op while email is not live. Returns false if deduped/skipped. */
export async function enqueueEmail(e: OutgoingEmail): Promise<boolean> {
  if (!(await isEmailLive())) return false;
  const { rows } = await query(
    `INSERT INTO email_outbox (to_email, user_id, category, subject, html, text_body, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [e.to, e.userId ?? null, e.category, e.subject.startsWith("[PRISM]") ? e.subject : `[PRISM] ${e.subject}`, e.html, e.text, e.dedupeKey ?? null]
  );
  return rows.length > 0;
}

/**
 * Whether a user should get an email in `category` right now. Inactive users
 * never do; mandatory categories ignore preferences; for instant categories,
 * digest-only users are skipped (their items show up in the next digest).
 */
export async function userWantsEmail(userId: string, category: EmailCategory): Promise<{ ok: boolean; email?: string }> {
  const { rows } = await query(
    `SELECT u.email, u.is_active, u.email_digest_only,
            (SELECT enabled FROM user_email_prefs p WHERE p.user_id = u.id AND p.category = $2) AS pref
     FROM users u WHERE u.id = $1`,
    [userId, category]
  );
  const u = rows[0];
  if (!u || !u.is_active || !u.email) return { ok: false };
  const meta = EMAIL_CATEGORIES[category];
  if (meta.mandatory) return { ok: true, email: u.email };
  if (u.pref === false) return { ok: false };
  if (meta.instant && u.email_digest_only) return { ok: false };
  return { ok: true, email: u.email };
}

/** Preference-aware enqueue for a known user. */
export async function emailUser(userId: string, e: Omit<OutgoingEmail, "to" | "userId">): Promise<boolean> {
  if (!(await isEmailLive())) return false;
  const want = await userWantsEmail(userId, e.category);
  if (!want.ok) return false;
  return enqueueEmail({ ...e, to: want.email!, userId });
}

// ── Worker ───────────────────────────────────────────────────────

// Exchange Online allows 30 messages/minute per mailbox; stay under it.
const BATCH_PER_RUN = 25;
const MAX_ATTEMPTS = 5;
let running = false;

/** Called every minute by the scheduler. Sends due emails, retries failures with backoff. */
export async function processOutbox(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Recover rows stuck in 'sending' (e.g. container restarted mid-send).
    await query(
      `UPDATE email_outbox SET status = 'pending' WHERE status = 'sending' AND send_after < now() - interval '10 minutes'`
    );

    const s = await getEmailSettings(true);
    if (!s.enabled || !isComplete(s)) return;

    const { rows } = await query(
      `UPDATE email_outbox SET status = 'sending', send_after = now()
       WHERE id IN (
         SELECT id FROM email_outbox
         WHERE status = 'pending' AND send_after <= now()
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, to_email, subject, html, text_body, attempts`,
      [BATCH_PER_RUN]
    );
    if (rows.length === 0) return;

    for (const m of rows) {
      try {
        await deliver(s, { to: m.to_email, subject: m.subject, html: m.html, text: m.text_body });
        await query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, [m.id]);
      } catch (err: any) {
        const attempts = m.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        // Backoff: 2, 8, 18, 32 minutes.
        await query(
          `UPDATE email_outbox
           SET status = $2, attempts = $3, last_error = $4,
               send_after = now() + make_interval(mins => $5::int)
           WHERE id = $1`,
          [m.id, failed ? "failed" : "pending", attempts, String(err?.message ?? err).slice(0, 1000), 2 * attempts * attempts]
        );
        console.error(`[mailer] send to ${m.to_email} failed (attempt ${attempts}):`, err?.message ?? err);
      }
    }
  } catch (err) {
    console.error("[mailer] outbox run failed:", err);
  } finally {
    running = false;
  }
}

/** Keeps the outbox from growing forever: sent mail kept 30 days, failures 90. */
export async function pruneOutbox(): Promise<void> {
  await query(
    `DELETE FROM email_outbox
     WHERE (status = 'sent' AND sent_at < now() - interval '30 days')
        OR (status = 'failed' AND created_at < now() - interval '90 days')`
  );
}
