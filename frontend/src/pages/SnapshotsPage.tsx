import { useEffect, useState } from "react";
import { api } from "../api";

export default function SnapshotsPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState("");
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }, []);

  useEffect(() => {
    if (!selectedDashboard) {
      setSnapshots([]);
      setSelectedSnapshot(null);
      return;
    }
    api(`/snapshots?dashboard_id=${selectedDashboard}`)
      .then((data) => {
        setSnapshots(data);
        setSelectedSnapshot(data[0] || null);
      })
      .catch(() => setSnapshots([]));
  }, [selectedDashboard]);

  async function generateSnapshot() {
    setError(null);
    try {
      await api("/snapshots/generate", {
        method: "POST",
        body: JSON.stringify({ dashboard_id: selectedDashboard })
      });
      const updated = await api(`/snapshots?dashboard_id=${selectedDashboard}`);
      setSnapshots(updated);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function downloadEmail() {
    if (!selectedDashboard) return;
    const url = `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/snapshots/email/${selectedDashboard}?preview=1`;
    window.open(url, "_blank");
  }

  return (
    <div>
      <h1>Publishing Snapshots</h1>
      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-row">
          <select className="select" value={selectedDashboard} onChange={(e) => setSelectedDashboard(e.target.value)}>
            <option value="">Select dashboard</option>
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button className="button" onClick={generateSnapshot} disabled={!selectedDashboard}>Generate Snapshot</button>
          <button className="button" onClick={downloadEmail} disabled={!selectedDashboard}>Download Email (.eml)</button>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Snapshot History</h3>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Items</th><th>Created</th></tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} onClick={() => setSelectedSnapshot(s)} style={{ cursor: "pointer" }}>
                  <td>{s.cycle_date}</td>
                  <td>{(s.content_json?.summary?.tasks?.total || 0) + (s.content_json?.summary?.risks?.total || 0) + (s.content_json?.summary?.decisions?.total || 0)}</td>
                  <td>{s.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Snapshot Preview</h3>
          {selectedSnapshot ? (
            <div>
              <div className="badge">Cycle: {selectedSnapshot.cycle_date}</div>
              <div style={{ marginTop: 12 }}>
                <strong>Executive Summary</strong>
                <div>Tasks: {selectedSnapshot.content_json?.summary?.tasks?.total || 0}</div>
                <div>Risks: {selectedSnapshot.content_json?.summary?.risks?.total || 0}</div>
                <div>Decisions: {selectedSnapshot.content_json?.summary?.decisions?.total || 0}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <strong>Open Tasks</strong>
                {(selectedSnapshot.content_json?.openTasks || selectedSnapshot.content_json?.tasks || []).slice(0, 5).map((t: any) => (
                  <div key={t.id}>{t.item_details}</div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <strong>Risks</strong>
                {(selectedSnapshot.content_json?.risks || []).slice(0, 5).map((r: any) => (
                  <div key={r.id}>{r.risk_title}</div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <strong>Decisions</strong>
                {(selectedSnapshot.content_json?.decisions || []).slice(0, 5).map((d: any) => (
                  <div key={d.id}>{d.decision_title}</div>
                ))}
              </div>
            </div>
          ) : (
            <div>No snapshot selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}
