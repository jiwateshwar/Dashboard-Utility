import { useEffect, useState } from "react";
import { api } from "../api";
import type { User } from "../App";

type EmailCategoryPref = { key: string; label: string; description: string; mandatory: boolean; enabled: boolean };
type EmailPrefs = { emailLive: boolean; email: string; digestOnly: boolean; categories: EmailCategoryPref[] };

function EmailPreferencesCard() {
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api("/email/preferences").then(setPrefs).catch(() => setPrefs(null));
  }, []);

  if (!prefs) return null;

  function toggle(key: string) {
    setMessage(null);
    setPrefs((p) => p && { ...p, categories: p.categories.map((c) => (c.key === key && !c.mandatory ? { ...c, enabled: !c.enabled } : c)) });
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setMessage(null);
    try {
      await api("/email/preferences", {
        method: "PUT",
        body: JSON.stringify({
          digestOnly: prefs.digestOnly,
          categories: Object.fromEntries(prefs.categories.map((c) => [c.key, c.enabled]))
        })
      });
      setMessage({ ok: true, text: "Email preferences saved." });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const instant = prefs.categories.filter((c) => !["daily_digest", "weekly_summary", "publishing"].includes(c.key));
  const scheduled = prefs.categories.filter((c) => ["daily_digest", "weekly_summary", "publishing"].includes(c.key));
  const row = (c: EmailCategoryPref, dimmed = false) => (
    <label key={c.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--border, #e6e9ef)", opacity: dimmed ? 0.55 : 1, cursor: c.mandatory ? "default" : "pointer" }}>
      <input type="checkbox" checked={c.enabled} disabled={c.mandatory} onChange={() => toggle(c.key)} style={{ marginTop: 3 }} />
      <span>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{c.label}</span>
        {c.mandatory && <span style={{ fontSize: 11, color: "var(--muted)" }}> · always on</span>}
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{c.description}</div>
      </span>
    </label>
  );

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 4 }}>Email Notifications</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
        Sent to <strong>{prefs.email}</strong>. In-app notifications are not affected by these settings.
        {!prefs.emailLive && <><br /><span style={{ color: "#d97706" }}>Email is not switched on for PRISM yet — your choices will apply once it is.</span></>}
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", marginBottom: 12, borderRadius: 6, background: "rgba(29,99,237,0.06)", cursor: "pointer" }}>
        <input type="checkbox" checked={prefs.digestOnly} onChange={() => { setMessage(null); setPrefs({ ...prefs, digestOnly: !prefs.digestOnly }); }} style={{ marginTop: 3 }} />
        <span>
          <span style={{ fontWeight: 500, fontSize: 14 }}>Digest only</span>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
            Don't email me as things happen — include them in my weekday-morning digest instead.
          </div>
        </span>
      </label>

      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", margin: "8px 0 2px" }}>As it happens</div>
      {instant.map((c) => row(c, prefs.digestOnly && !c.mandatory))}
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 2px" }}>Scheduled</div>
      {scheduled.map((c) => row(c))}

      {message && (
        <div style={{ marginTop: 12, fontSize: 13, color: message.ok ? "#22c55e" : "#ef6a62" }}>{message.text}</div>
      )}
      <button className="button" style={{ marginTop: 16, minWidth: 140 }} onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Preferences"}
      </button>
    </div>
  );
}

export default function ProfilePage({ user }: { user: User }) {
  const [employeeId, setEmployeeId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    if (employeeId.length < 4 || employeeId.length > 10) {
      setError("Employee ID must be 4–10 characters.");
      return;
    }
    if (employeeId !== confirm) {
      setError("Employee IDs do not match.");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/me/employee-id", {
        method: "PATCH",
        body: JSON.stringify({ employee_id: employeeId }),
      });
      setSuccess(true);
      setEmployeeId("");
      setConfirm("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ marginBottom: 4 }}>My Profile</h1>
      <p style={{ color: "var(--muted)", marginBottom: 28, fontSize: 14 }}>
        Manage your account details.
      </p>

      {/* Account info */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Name</div>
          <div style={{ fontWeight: 500 }}>{user.name}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Email</div>
          <div>{user.email}</div>
        </div>
        <div style={{ marginBottom: user.sso_linked ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Role</div>
          <div>{user.role}</div>
        </div>
        {user.sso_linked && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#2ebd85", fontWeight: 500 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2ebd85", display: "inline-block" }} />
            Signed in via Microsoft (SSO)
          </div>
        )}
      </div>

      {/* Employee ID update */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Employee ID</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          Your employee ID is used to sign in. It must be 4–10 characters.
          If you have never set one, the default is <strong>1111</strong>.
        </p>

        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
          New Employee ID
        </label>
        <input
          className="input"
          type="password"
          placeholder="4–10 characters"
          value={employeeId}
          onChange={(e) => { setEmployeeId(e.target.value); setSuccess(false); }}
          maxLength={10}
        />

        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginTop: 12, marginBottom: 6 }}>
          Confirm Employee ID
        </label>
        <input
          className="input"
          type="password"
          placeholder="Re-enter to confirm"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setSuccess(false); }}
          maxLength={10}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />

        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(239,106,98,0.1)", border: "1px solid rgba(239,106,98,0.3)", borderRadius: 6, color: "#ef6a62", fontSize: 13 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, color: "#22c55e", fontSize: 13 }}>
            Employee ID updated successfully. Use it next time you log in.
          </div>
        )}

        <button
          className="button"
          style={{ marginTop: 16, minWidth: 140 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Update Employee ID"}
        </button>
      </div>

      <EmailPreferencesCard />
    </div>
  );
}
