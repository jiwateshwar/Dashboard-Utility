import { useEffect, useState } from "react";
import { api } from "../api";

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d.slice(0, 10)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(d?: string) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
}

const STATUS_CLASS: Record<string, string> = {
  "Open": "amber", "In Progress": "green",
  "Closed Pending Approval": "amber", "Closed Accepted": "green",
  "Critical": "red", "High": "red", "Medium": "amber", "Low": "green",
  "Pending": "amber", "Approved": "green", "Rejected": "red", "Deferred": "amber",
  "Mitigated": "green", "Closed": "green"
};

export default function SnapshotsPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState("");
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("/dashboards")
      .then((data: any[]) => setDashboards(data.filter((d) => d.has_access)))
      .catch(() => setDashboards([]));
  }, []);

  useEffect(() => {
    if (!selectedDashboard) { setSnapshots([]); setSelectedSnapshot(null); return; }
    loadSnapshots();
  }, [selectedDashboard]);

  async function loadSnapshots() {
    try {
      const data: any[] = await api(`/snapshots?dashboard_id=${selectedDashboard}`);
      setSnapshots(data);
      setSelectedSnapshot((prev: any) => data.find((s) => s.id === prev?.id) ?? data[0] ?? null);
    } catch {
      setSnapshots([]);
    }
  }

  async function generateSnapshot() {
    if (!selectedDashboard) return;
    setGenerating(true);
    setError(null);
    try {
      await api("/snapshots/generate", {
        method: "POST",
        body: JSON.stringify({ dashboard_id: selectedDashboard, published_only: publishedOnly })
      });
      await loadSnapshots();
    } catch (err: any) {
      setError(err.message || "Failed to generate snapshot");
    } finally {
      setGenerating(false);
    }
  }

  function downloadSnapshotEmail(snapId: string) {
    window.open(`/api/snapshots/${snapId}/email`, "_blank");
  }

  function downloadLatestEmail() {
    if (!selectedDashboard) return;
    window.open(`/api/snapshots/email/${selectedDashboard}`, "_blank");
  }

  const snap = selectedSnapshot;
  const content = snap?.content_json;
  const openTasks: any[] = content?.openTasks ?? content?.tasks ?? [];
  const risks: any[] = content?.risks ?? [];
  const decisions: any[] = content?.decisions ?? [];
  const closedTasks: any[] = content?.closedTasks ?? [];
  const closedRisks: any[] = content?.closedRisks ?? [];
  const closedDecisions: any[] = content?.closedDecisions ?? [];

  const tasksByCategory: Record<string, any[]> = {};
  for (const t of openTasks) {
    const cat = t.category_name ?? "Uncategorised";
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat].push(t);
  }

  return (
    <div>
      <h1>Publishing</h1>
      {error && <div style={{ color: "#ef6a62", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row" style={{ marginBottom: 12 }}>
          <select className="select" value={selectedDashboard} onChange={(e) => setSelectedDashboard(e.target.value)}>
            <option value="">Select dashboard…</option>
            {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(e) => setPublishedOnly(e.target.checked)}
            />
            Published items only (items with "Publish" flag set)
          </label>
        </div>
        <div className="inline-actions">
          <button className="button" onClick={generateSnapshot} disabled={!selectedDashboard || generating}>
            {generating ? "Generating…" : "Generate Snapshot"}
          </button>
          <button className="button secondary" onClick={downloadLatestEmail} disabled={!selectedDashboard}>
            Download Latest Email (.eml)
          </button>
        </div>
        {!selectedDashboard && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            Select a dashboard to generate or download a snapshot email.
          </div>
        )}
      </div>

      {selectedDashboard && (
        <div className="grid two" style={{ alignItems: "start" }}>
          {/* Snapshot history */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Snapshot History</h3>
            {snapshots.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No snapshots yet. Generate one above.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Tasks</th><th>Risks</th><th>Decisions</th><th>Filter</th><th>Expires</th><th></th></tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => {
                    const expired = s.is_expired;
                    const days = daysUntil(s.expires_at);
                    const expiringSoon = !expired && days !== null && days <= 30;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedSnapshot(s)}
                        style={{
                          cursor: "pointer",
                          opacity: expired ? 0.5 : 1,
                          background: selectedSnapshot?.id === s.id ? "var(--hover, #f3f4f6)" : undefined
                        }}
                      >
                        <td>{fmt(s.cycle_date)}</td>
                        <td>{s.content_json?.summary?.tasks?.total ?? 0}</td>
                        <td>{s.content_json?.summary?.risks?.total ?? 0}</td>
                        <td>{s.content_json?.summary?.decisions?.total ?? 0}</td>
                        <td>
                          {s.published_only
                            ? <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>published</span>
                            : <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>all</span>
                          }
                        </td>
                        <td>
                          {expired
                            ? <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(107,114,128,0.12)", color: "#6b7280", fontWeight: 600 }}>Expired</span>
                            : expiringSoon
                              ? <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(245,166,35,0.12)", color: "#d97706", fontWeight: 600 }}>{days}d</span>
                              : <span style={{ fontSize: 11, color: "var(--muted)" }}>{days}d</span>
                          }
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            className="button secondary"
                            style={{ height: 26, padding: "0 10px", fontSize: 11 }}
                            onClick={() => downloadSnapshotEmail(s.id)}
                            title="Download email for this snapshot"
                          >
                            ↓ .eml
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Snapshot preview */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Preview</h3>
              {snap && (
                <button
                  className="button secondary"
                  style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                  onClick={() => downloadSnapshotEmail(snap.id)}
                >
                  ↓ Download .eml
                </button>
              )}
            </div>
            {!snap ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Select a snapshot from the history to preview it.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                  {fmt(snap.cycle_date)}
                  {snap.published_only && <> &nbsp;·&nbsp; <em>Published items only</em></>}
                  {snap.is_expired && <> &nbsp;·&nbsp; <span style={{ color: "#9ca3af" }}>Expired</span></>}
                </div>

                {/* Summary stats */}
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  {[
                    { label: "Tasks", value: content?.summary?.tasks?.total ?? 0, sub: `${content?.summary?.tasks?.open ?? 0} open` },
                    { label: "Risks", value: content?.summary?.risks?.total ?? 0, sub: `${content?.summary?.risks?.red ?? 0} critical` },
                    { label: "Decisions", value: content?.summary?.decisions?.total ?? 0, sub: `${content?.summary?.decisions?.pending ?? 0} pending` },
                  ].map(({ label, value, sub }) => (
                    <div key={label} style={{ flex: 1, minWidth: 80, background: "var(--surface-2, #f3f4f6)", borderRadius: 6, padding: "10px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Tasks by category */}
                {Object.keys(tasksByCategory).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
                      Tasks <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({openTasks.length})</span>
                    </div>
                    {Object.entries(tasksByCategory).map(([cat, items]) => (
                      <div key={cat}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", padding: "8px 0 2px", letterSpacing: "0.05em" }}>{cat}</div>
                        {items.map((t) => (
                          <div key={t.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{t.item_details}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                {t.account_name ?? "—"} · {t.owner_name ?? "—"}{t.target_date ? ` · Due ${t.target_date.slice(0, 10)}` : ""}
                              </div>
                            </div>
                            <span className={`tag ${STATUS_CLASS[t.status] ?? "amber"}`} style={{ flexShrink: 0 }}>{t.status}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Risks */}
                {risks.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
                      Risks <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({risks.length})</span>
                    </div>
                    {risks.map((r) => (
                      <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{r.risk_title}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.account_name ?? "—"} · {r.owner_name ?? "—"}</div>
                        </div>
                        <span className={`tag ${STATUS_CLASS[r.impact_level] ?? "amber"}`} style={{ flexShrink: 0 }}>{r.impact_level}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Decisions */}
                {decisions.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
                      Decisions <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({decisions.length})</span>
                    </div>
                    {decisions.map((d) => (
                      <div key={d.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{d.decision_title}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {d.account_name ?? "—"} · {d.owner_name ?? "—"}{d.decision_deadline ? ` · Due ${d.decision_deadline.slice(0, 10)}` : ""}
                          </div>
                        </div>
                        <span className={`tag ${STATUS_CLASS[d.status] ?? "amber"}`} style={{ flexShrink: 0 }}>{d.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Closed */}
                {(closedTasks.length + closedRisks.length + closedDecisions.length) > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
                      Closed (last 45 days) <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>({closedTasks.length + closedRisks.length + closedDecisions.length})</span>
                    </div>
                    {closedTasks.map((t) => (
                      <div key={t.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{t.item_details}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Task · {t.owner_name ?? "—"}</div>
                      </div>
                    ))}
                    {closedRisks.map((r) => (
                      <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{r.risk_title}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Risk · {r.owner_name ?? "—"}</div>
                      </div>
                    ))}
                    {closedDecisions.map((d) => (
                      <div key={d.id} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{d.decision_title}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Decision · {d.owner_name ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {openTasks.length === 0 && risks.length === 0 && decisions.length === 0 && (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>No items in this snapshot.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
