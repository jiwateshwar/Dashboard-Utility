import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Snapshot = {
  id: string;
  created_at: string;
  trigger_type: "weekly" | "manual_export" | "pre_rollback_safety" | "import";
  status: "in_progress" | "complete" | "failed";
  size_bytes: number | null;
  schema_last_migration: string | null;
  created_by_name: string | null;
  error_message: string | null;
};

const TRIGGER_LABELS: Record<string, string> = {
  weekly: "Weekly (auto)",
  manual_export: "Manual export",
  pre_rollback_safety: "Pre-rollback safety",
  import: "Imported"
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function SystemBackupsPage() {
  const [me, setMe] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConfirm, setImportConfirm] = useState("");
  const [importing, setImporting] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<Snapshot | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState("");
  const [rollingBack, setRollingBack] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const [meData, snaps] = await Promise.all([api("/auth/me"), api("/db-snapshots")]);
      setMe(meData);
      setSnapshots(snaps);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      const snap = await api("/db-snapshots/manual", { method: "POST" });
      window.open(`${API_URL}/api/db-snapshots/${snap.id}/download`, "_blank");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!importFile) return;
    setError(null);
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("confirm", importConfirm);
      const res = await fetch(`${API_URL}/api/db-snapshots/import`, {
        method: "POST",
        credentials: "include",
        body: form
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Import failed");
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
      setImporting(false);
    }
  }

  async function handleRollback() {
    if (!rollbackTarget) return;
    setError(null);
    setRollingBack(true);
    try {
      await api(`/db-snapshots/${rollbackTarget.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({ confirm: rollbackConfirm })
      });
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
      setRollingBack(false);
    }
  }

  if (me && me.role !== "SuperAdmin") {
    return <div className="card">SuperAdmin access required.</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>System Backups</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        Export/import the full application database for migrating to a new host, and roll back
        to a previous weekly snapshot if something goes wrong.
      </p>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Export Full Backup</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Downloads a single file containing all application data. Upload it on a fresh PRISM
            instance to migrate everything to a new host.
          </p>
          <button className="button" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : "Export & Download"}
          </button>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Import Backup</h3>
          <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            <strong>Warning:</strong> this permanently replaces ALL current data on this instance
            with the uploaded backup's data, and logs everyone out, including you.
          </p>
          <input ref={fileInputRef} type="file" accept=".gz" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          {importFile && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                Type <strong>REPLACE ALL DATA</strong> to confirm:
              </label>
              <input
                className="input"
                value={importConfirm}
                onChange={(e) => setImportConfirm(e.target.value)}
                style={{ maxWidth: 260 }}
              />
              <button
                className="button danger"
                style={{ marginLeft: 8 }}
                disabled={importConfirm !== "REPLACE ALL DATA" || importing}
                onClick={handleImport}
              >
                {importing ? "Importing…" : "Import & Replace Everything"}
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 12px 0" }}>Snapshot History</h3>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Trigger</th><th>Status</th><th>Size</th><th>Created by</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {snapshots.length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--muted)", textAlign: "center" }}>No snapshots yet</td></tr>
              )}
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontSize: 13 }}>{new Date(s.created_at).toLocaleString()}</td>
                  <td style={{ fontSize: 13 }}>{TRIGGER_LABELS[s.trigger_type] || s.trigger_type}</td>
                  <td>
                    <span className="badge" style={{
                      color: s.status === "failed" ? "#ef6a62" : s.status === "complete" ? "#2ebd85" : "var(--muted)"
                    }}>
                      {s.status}
                    </span>
                    {s.status === "failed" && s.error_message && (
                      <div style={{ fontSize: 11, color: "#ef6a62", marginTop: 2 }}>{s.error_message}</div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{formatBytes(s.size_bytes)}</td>
                  <td style={{ fontSize: 13, color: "var(--muted)" }}>{s.created_by_name || "System (cron)"}</td>
                  <td>
                    <div className="inline-actions">
                      {s.status === "complete" && (
                        <button
                          className="button secondary"
                          style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                          onClick={() => window.open(`${API_URL}/api/db-snapshots/${s.id}/download`, "_blank")}
                        >
                          Download
                        </button>
                      )}
                      {s.status === "complete" && (
                        <button
                          className="button danger"
                          style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                          onClick={() => { setRollbackTarget(s); setRollbackConfirm(""); }}
                        >
                          Rollback to this
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rollbackTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200
        }}>
          <div className="card" style={{ maxWidth: 440 }}>
            <h3 style={{ marginTop: 0 }}>Roll back to {new Date(rollbackTarget.created_at).toLocaleString()}?</h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
              This will permanently replace <strong>ALL current data</strong> with this snapshot's data.
              Everyone, including you, will be logged out. A safety snapshot of the current state is
              taken automatically first, so this rollback itself could be undone — but any changes made
              after this snapshot's timestamp will be lost.
            </p>
            <label style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              Type <strong>ROLLBACK</strong> to confirm:
            </label>
            <input className="input" value={rollbackConfirm} onChange={(e) => setRollbackConfirm(e.target.value)} />
            <div className="inline-actions" style={{ marginTop: 16 }}>
              <button
                className="button danger"
                disabled={rollbackConfirm !== "ROLLBACK" || rollingBack}
                onClick={handleRollback}
              >
                {rollingBack ? "Rolling back…" : "Confirm Rollback"}
              </button>
              <button className="button secondary" onClick={() => setRollbackTarget(null)} disabled={rollingBack}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
