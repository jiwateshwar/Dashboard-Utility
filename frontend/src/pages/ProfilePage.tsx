import { useState } from "react";
import { api } from "../api";
import type { User } from "../App";

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
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Role</div>
          <div>{user.role}</div>
        </div>
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
    </div>
  );
}
