import { useEffect, useState } from "react";
import { api } from "../api";

type EmailSettings = {
  transport: "graph" | "smtp";
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
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

type OutboxRow = {
  id: string;
  to_email: string;
  category: string;
  subject: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const STATUS_COLOR: Record<string, string> = { sent: "#2ebd85", failed: "#ef6a62", pending: "#d97706", sending: "#d97706" };

export default function EmailSettingsPage() {
  const [me, setMe] = useState<any>(null);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState({
    transport: "graph" as "graph" | "smtp",
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPassword: "",
    tlsRejectUnauthorized: true,
    tlsCaPem: "",
    fromAddress: "",
    fromName: "PRISM",
    appBaseUrl: ""
  });
  const [testTo, setTestTo] = useState("");
  const [outbox, setOutbox] = useState<{ counts: Record<string, number>; recent: OutboxRow[] } | null>(null);
  const [outboxFilter, setOutboxFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function apply(s: EmailSettings) {
    setSettings(s);
    setForm({
      transport: s.transport ?? "graph",
      smtpHost: s.smtpHost ?? "",
      smtpPort: String(s.smtpPort ?? 587),
      smtpSecure: s.smtpSecure,
      smtpUser: s.smtpUser ?? "",
      smtpPassword: "",
      tlsRejectUnauthorized: s.tlsRejectUnauthorized,
      tlsCaPem: s.tlsCaPem ?? "",
      fromAddress: s.fromAddress ?? "",
      fromName: s.fromName ?? "PRISM",
      appBaseUrl: s.appBaseUrl ?? window.location.origin
    });
  }

  async function loadOutbox(status = outboxFilter) {
    try {
      setOutbox(await api(`/email/outbox${status ? `?status=${status}` : ""}`));
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const meData = await api("/auth/me");
        setMe(meData);
        if (meData.role !== "SuperAdmin") return;
        apply(await api("/email/settings"));
        loadOutbox("");
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, []);

  async function run(name: string, fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(name);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const handleSave = () =>
    run("save", async () => {
      const body: any = { ...form, smtpPort: Number(form.smtpPort) };
      if (!form.smtpPassword) delete body.smtpPassword;
      apply(await api("/email/settings", { method: "PUT", body: JSON.stringify(body) }));
      setNotice("Saved. Email is offline until you send a successful test email and go live.");
    });

  const handleTest = () =>
    run("test", async () => {
      const result = await api("/email/settings/test", { method: "POST", body: JSON.stringify(testTo.trim() ? { to: testTo.trim() } : {}) });
      apply(await api("/email/settings"));
      if (result.ok) setNotice(`Test email sent to ${result.to}. Check the inbox (and junk folder), then go live.`);
      else setError(result.error || "Test email failed");
    });

  const handleToggle = (enabled: boolean) =>
    run("toggle", async () => {
      apply(await api("/email/settings/enable", { method: "POST", body: JSON.stringify({ enabled }) }));
      setNotice(enabled ? "Email notifications are now live." : "Email notifications are off. Nothing new will be queued.");
    });

  const handlePreview = (kind: "digest" | "weekly") =>
    run(`preview-${kind}`, async () => {
      const r = await api(`/email/preview/${kind}`, { method: "POST" });
      setNotice(r.message);
      setTimeout(() => loadOutbox(), 3000);
    });

  const handleRetry = (id: string) =>
    run("retry", async () => {
      await api(`/email/outbox/${id}/retry`, { method: "POST" });
      setTimeout(() => loadOutbox(), 3000);
    });

  if (me && me.role !== "SuperAdmin") {
    return <div className="card">SuperAdmin access required.</div>;
  }

  const savedComplete = !!(settings?.fromAddress && (settings.transport === "graph" || settings.smtpHost));
  const canGoLive = savedComplete && settings?.lastTestOk === true;
  const statusLabel = settings?.enabled ? "Live" : savedComplete ? "Configured, not live" : "Not configured";
  const statusColor = settings?.enabled ? "#2ebd85" : savedComplete ? "#d97706" : "var(--muted)";
  const set = (k: keyof typeof form) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const field = { marginBottom: 12, width: "100%", maxWidth: 480 } as const;
  const label = { fontSize: 13, display: "block", marginBottom: 6 } as const;

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Email Notifications</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        Configure the mailbox PRISM sends from. Email covers assignments, approvals, request outcomes,
        critical risks, a weekday-morning digest and a Monday summary. Each user can opt out per category from
        their profile.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Status:</span>
        <span className="badge" style={{ color: statusColor }}>{statusLabel}</span>
        {settings?.updatedAt && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>· last saved {new Date(settings.updatedAt).toLocaleString()}</span>
        )}
      </div>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12, whiteSpace: "pre-wrap" }}>{error}</div>}
      {notice && <div style={{ color: "#2ebd85", marginBottom: 12 }}>{notice}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <h3 style={{ margin: "0 0 12px 0" }}>Sending method</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxWidth: 560 }}>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="radio" name="transport" checked={form.transport === "graph"} onChange={() => setForm((f) => ({ ...f, transport: "graph" }))} style={{ marginTop: 3 }} />
              <span>
                <strong>Microsoft 365 (Graph API)</strong> — recommended. Uses the App Registration from SSO Settings; no mailbox password.
              </span>
            </label>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="radio" name="transport" checked={form.transport === "smtp"} onChange={() => setForm((f) => ({ ...f, transport: "smtp" }))} style={{ marginTop: 3 }} />
              <span>
                <strong>SMTP server</strong> — an internal mail relay, or a mailbox with SMTP AUTH enabled.
              </span>
            </label>
          </div>

          {form.transport === "graph" && (
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 16, maxWidth: 560, padding: "10px 12px", borderRadius: 6, background: "rgba(29,99,237,0.06)" }}>
              One-time setup by a Microsoft 365 / Azure admin:
              <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
                <li>In the App Registration used for SSO → API permissions → add <strong>Microsoft Graph › Application › Mail.Send</strong> and grant admin consent.</li>
                <li>Recommended: limit it to the sending mailbox with an Exchange <em>application access policy</em> (<code>New-ApplicationAccessPolicy -AccessRight RestrictAccess</code>).</li>
                <li>The tenant ID, client ID and client secret must be saved under SSO Settings (SSO login itself doesn't need to be live).</li>
              </ol>
            </div>
          )}

          {form.transport === "smtp" && (<>
          <h3 style={{ margin: "0 0 12px 0" }}>SMTP Server</h3>

          <label style={label}>SMTP host</label>
          <input className="input" value={form.smtpHost} onChange={set("smtpHost")} placeholder="smtp.office365.com" style={field} />

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", maxWidth: 480 }}>
            <div>
              <label style={label}>Port</label>
              <input className="input" value={form.smtpPort} onChange={set("smtpPort")} style={{ width: 100, marginBottom: 12 }} inputMode="numeric" />
            </div>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 20 }}>
              <input type="checkbox" checked={form.smtpSecure} onChange={set("smtpSecure")} />
              Implicit TLS (port 465)
            </label>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: -6, marginBottom: 12, maxWidth: 480 }}>
            Leave unticked for port 587 or 25 (STARTTLS is used when the server offers it).
          </p>

          <label style={label}>Username</label>
          <input className="input" value={form.smtpUser} onChange={set("smtpUser")} placeholder="Login for the sending mailbox (blank = no auth)" style={field} autoComplete="off" />

          <label style={label}>Password</label>
          <input
            className="input"
            type="password"
            value={form.smtpPassword}
            onChange={set("smtpPassword")}
            placeholder={settings?.smtpPasswordSet ? "•••••••• (unchanged — enter a new value to replace it)" : "Mailbox password"}
            style={field}
            autoComplete="new-password"
          />

          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginBottom: 16 }}>
            <input type="checkbox" checked={form.tlsRejectUnauthorized} onChange={set("tlsRejectUnauthorized")} />
            Verify the server's TLS certificate (untick only for an internal relay with a self-signed certificate)
          </label>

          <label style={label}>Trusted CA certificate (optional, PEM)</label>
          <textarea
            className="input"
            value={form.tlsCaPem ?? ""}
            onChange={set("tlsCaPem")}
            placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
            rows={5}
            spellCheck={false}
            style={{ ...field, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }}
          />
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -6, marginBottom: 16, maxWidth: 480 }}>
            Only needed if the test fails with a certificate error. Paste the issuing or intermediate CA certificate(s);
            they are trusted in addition to the standard public roots, so verification stays on.
          </div>
          </>)}

          <h3 style={{ margin: "8px 0 12px 0" }}>Sender & Links</h3>
          <label style={label}>From address{form.transport === "graph" ? " (an existing mailbox, e.g. a shared mailbox)" : ""}</label>
          <input className="input" value={form.fromAddress} onChange={set("fromAddress")} placeholder="prism-noreply@comviva.com" style={field} />

          <label style={label}>From name</label>
          <input className="input" value={form.fromName} onChange={set("fromName")} style={field} />

          <label style={label}>App URL used in email links</label>
          <input className="input" value={form.appBaseUrl} onChange={set("appBaseUrl")} placeholder="https://prism.comviva.com" style={{ ...field, marginBottom: 16 }} />

          <div>
            <button className="button" onClick={handleSave} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Send Test Email</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Sends a real email using the saved settings. Required after every save before going live.
          </p>
          <input
            className="input"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder={me?.email ? `Recipient (default: ${me.email})` : "Recipient"}
            style={field}
          />
          <div>
            <button className="button secondary" onClick={handleTest} disabled={!savedComplete || busy !== null}>
              {busy === "test" ? "Sending…" : "Send Test Email"}
            </button>
          </div>
          {settings?.lastTestedAt && (
            <div style={{ marginTop: 10, fontSize: 13 }}>
              Last tested {new Date(settings.lastTestedAt).toLocaleString()} —{" "}
              <span style={{ color: settings.lastTestOk ? "#2ebd85" : "#ef6a62" }}>{settings.lastTestOk ? "passed" : "failed"}</span>
              {!settings.lastTestOk && settings.lastTestError && (
                <div style={{ color: "#ef6a62", marginTop: 4, whiteSpace: "pre-wrap" }}>{settings.lastTestError}</div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Go Live</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            {settings?.enabled
              ? "Email notifications are live. Taking them offline stops new emails from being queued."
              : "Once a test email has gone through, turn email notifications on for everyone."}
          </p>
          {settings?.enabled ? (
            <button className="button danger" onClick={() => handleToggle(false)} disabled={busy !== null}>
              {busy === "toggle" ? "Working…" : "Take Offline"}
            </button>
          ) : (
            <button className="button" onClick={() => handleToggle(true)} disabled={!canGoLive || busy !== null}>
              {busy === "toggle" ? "Working…" : "Go Live"}
            </button>
          )}
        </div>

        {settings?.enabled && (
          <div className="card">
            <h3 style={{ margin: "0 0 8px 0" }}>Preview Scheduled Emails</h3>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
              Sends you your own copy now. Daily digest goes out weekdays at 08:30 IST; weekly summary Mondays at 09:00 IST.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="button secondary" onClick={() => handlePreview("digest")} disabled={busy !== null}>
                {busy === "preview-digest" ? "Queuing…" : "Send me today's digest"}
              </button>
              <button className="button secondary" onClick={() => handlePreview("weekly")} disabled={busy !== null}>
                {busy === "preview-weekly" ? "Queuing…" : "Send me the weekly summary"}
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Outbox</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="input"
                value={outboxFilter}
                onChange={(e) => { setOutboxFilter(e.target.value); loadOutbox(e.target.value); }}
                style={{ width: "auto" }}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
              <button className="button secondary" onClick={() => loadOutbox()}>Refresh</button>
            </div>
          </div>
          {outbox && (
            <>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                Last 7 days:{" "}
                {["sent", "pending", "failed"].map((s) => (
                  <span key={s} style={{ marginRight: 12 }}>
                    <span style={{ color: STATUS_COLOR[s] }}>{outbox.counts[s] ?? 0}</span> {s}
                  </span>
                ))}
              </div>
              {outbox.recent.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No emails yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>When</th>
                        <th style={{ textAlign: "left" }}>To</th>
                        <th style={{ textAlign: "left" }}>Subject</th>
                        <th style={{ textAlign: "left" }}>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {outbox.recent.map((r) => (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                          <td>{r.to_email}</td>
                          <td>{r.subject}</td>
                          <td title={r.last_error ?? ""}>
                            <span style={{ color: STATUS_COLOR[r.status] }}>{r.status}</span>
                            {r.attempts > 1 && <span style={{ color: "var(--muted)" }}> · {r.attempts} tries</span>}
                            {r.status !== "sent" && r.last_error && (
                              <div style={{ color: "#ef6a62", fontSize: 12, maxWidth: 320 }}>{r.last_error}</div>
                            )}
                          </td>
                          <td>
                            {r.status === "failed" && (
                              <button className="button secondary" onClick={() => handleRetry(r.id)} disabled={busy !== null}>
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
