import { useEffect, useState } from "react";
import { api } from "../api";

type Tab = "overview" | "escalations" | "approvals";

const TASK_STATUS_CLASS: Record<string, string> = {
  Open: "amber",
  "In Progress": "green",
  "Closed Pending Approval": "amber",
  "Closed Accepted": "green",
};
const IMPACT_CLASS: Record<string, string> = { Low: "green", Medium: "amber", High: "red", Critical: "red" };
const DECISION_STATUS_CLASS: Record<string, string> = { Pending: "amber", Approved: "green", Rejected: "red", Deferred: "amber" };

function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

function daysPastDue(targetDate?: string): number {
  if (!targetDate) return -999;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(targetDate.slice(0, 10));
  return Math.floor((today.getTime() - due.getTime()) / 86400000);
}

function AgingChip({ targetDate, status }: { targetDate?: string; status?: string }) {
  const closed = ["Closed Accepted", "Closed Pending Approval"];
  if (!targetDate || (status && closed.includes(status))) return null;
  const days = daysPastDue(targetDate);
  if (days <= 0) return null;
  const [bg, color] =
    days <= 3  ? ["rgba(245,166,35,0.15)",  "#f5a623"] :
    days <= 7  ? ["rgba(251,140,0,0.15)",   "#fb8c00"] :
    days <= 14 ? ["rgba(239,106,98,0.15)",  "#ef6a62"] :
                 ["rgba(198,40,40,0.15)",   "#c62828"];
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: bg, color, whiteSpace: "nowrap" }}>
      +{days}d overdue
    </span>
  );
}

function DeadlineChip({ deadline }: { deadline?: string }) {
  if (!deadline) return null;
  const days = daysPastDue(deadline);
  if (days <= 0) return null;
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: "rgba(198,40,40,0.12)", color: "#c62828", whiteSpace: "nowrap" }}>
      +{days}d overdue
    </span>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{ marginLeft: 6, background: "rgba(245,166,35,0.18)", color: "#f5a623", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
      {count}
    </span>
  );
}

export default function TeamPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [showOverdue, setShowOverdue] = useState(false);
  const [showRed, setShowRed] = useState(false);

  useEffect(() => {
    api("/team").then(setData);
  }, []);

  if (!data) return <div className="dashboard-shell"><div>Loading...</div></div>;

  const escalations: any[] = data.escalations ?? [];
  const pendingApprovals: any[] = data.pendingApprovals ?? [];

  const filteredTasks = data.tasks.filter((t: any) => {
    const closed = ["Closed Accepted", "Closed Pending Approval"];
    if (showRed && (!t.target_date || closed.includes(t.status) || new Date(t.target_date).getTime() >= Date.now())) return false;
    if (showOverdue && t.target_date) return new Date(t.target_date).getTime() < Date.now();
    return true;
  });
  const filteredRisks = data.risks.filter((r: any) => {
    if (showRed && r.impact_level !== "Critical") return false;
    if (showOverdue && r.target_mitigation_date) return new Date(r.target_mitigation_date).getTime() < Date.now();
    return true;
  });
  const filteredDecisions = data.decisions.filter((d: any) => {
    if (showOverdue && d.decision_deadline) return new Date(d.decision_deadline).getTime() < Date.now();
    return true;
  });

  const overdueTasks = data.tasks.filter((t: any) => {
    const closed = ["Closed Accepted", "Closed Pending Approval"];
    if (!t.target_date || closed.includes(t.status)) return false;
    return daysPastDue(t.target_date) > 0;
  });
  const activeRisks = data.risks.filter((r: any) => r.status !== "Closed" && r.status !== "Mitigated");
  const pendingDecisions = data.decisions.filter((d: any) => d.status === "Pending");

  return (
    <div className="dashboard-shell">
      <div className="dashboard-header">
        <h1>Team View</h1>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ marginTop: 12 }}>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#1d63ed" }}>{data.tasks.length}</div>
            <div className="kpi-label">Team Tasks</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#e53935" }}>{overdueTasks.length}</div>
            <div className="kpi-label">Overdue Tasks</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#2ebd85" }}>{activeRisks.length}</div>
            <div className="kpi-label">Active Risks</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#f5a623" }}>{pendingDecisions.length}</div>
            <div className="kpi-label">Decisions Pending</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#6366f1" }}>{pendingApprovals.length}</div>
            <div className="kpi-label">Pending Approvals</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#f5a623" }}>{escalations.length}</div>
            <div className="kpi-label">Escalations</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        <button className={`tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={`tab${tab === "escalations" ? " active" : ""}`} onClick={() => setTab("escalations")}>
          Escalations<CountBadge count={escalations.length} />
        </button>
        <button className={`tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
          Pending Approvals<CountBadge count={pendingApprovals.length} />
        </button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <>
          <div className="inline-actions" style={{ marginBottom: 12 }}>
            <label className="badge">
              <input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} /> Overdue Only
            </label>
            <label className="badge">
              <input type="checkbox" checked={showRed} onChange={(e) => setShowRed(e.target.checked)} /> Overdue Tasks / Critical Risks
            </label>
          </div>

          {/* Tasks */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Tasks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {filteredTasks.length} {filteredTasks.length === 1 ? "item" : "items"}
              </span>
            </div>
            {filteredTasks.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No tasks</div>
            ) : (
              filteredTasks.map((t: any) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--border)", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{t.item_details}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {t.target_date ? `Due ${fmt(t.target_date)}` : "No due date"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <AgingChip targetDate={t.target_date} status={t.status} />
                    <span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Risks */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Risks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {filteredRisks.length} {filteredRisks.length === 1 ? "item" : "items"}
              </span>
            </div>
            {filteredRisks.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No risks</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Risk</th><th>Impact</th><th>Probability</th><th>Mitigation Target</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredRisks.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{r.risk_title}</div>
                        {r.risk_description && <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.risk_description}</div>}
                      </td>
                      <td><span className={`tag ${IMPACT_CLASS[r.impact_level] ?? "amber"}`}>{r.impact_level}</span></td>
                      <td>{r.probability}</td>
                      <td>
                        <div>{fmt(r.target_mitigation_date)}</div>
                        {r.status !== "Closed" && r.status !== "Mitigated" && <DeadlineChip deadline={r.target_mitigation_date} />}
                      </td>
                      <td><span className={`tag ${r.status === "Closed" || r.status === "Mitigated" ? "green" : "amber"}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Decisions */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Decisions</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {filteredDecisions.length} {filteredDecisions.length === 1 ? "item" : "items"}
              </span>
            </div>
            {filteredDecisions.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No decisions</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Decision</th><th>Deadline</th><th>Impact Area</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredDecisions.map((d: any) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{d.decision_title}</div>
                        {d.decision_context && <div style={{ color: "var(--muted)", fontSize: 12 }}>{d.decision_context}</div>}
                      </td>
                      <td>
                        <div>{fmt(d.decision_deadline)}</div>
                        {d.status === "Pending" && <DeadlineChip deadline={d.decision_deadline} />}
                      </td>
                      <td>{d.impact_area || "—"}</td>
                      <td><span className={`tag ${DECISION_STATUS_CLASS[d.status] ?? "amber"}`}>{d.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── ESCALATIONS ── */}
      {tab === "escalations" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Team Escalations</h3>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
              {escalations.length} {escalations.length === 1 ? "item" : "items"}
            </span>
          </div>
          {escalations.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No escalations</div>
          ) : (
            escalations.map((e: any) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--border)", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  {e.user_name && (
                    <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 500, marginBottom: 2 }}>{e.user_name}</div>
                  )}
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{e.message}</div>
                  {e.created_at && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{fmt(e.created_at)}</div>}
                </div>
                {!e.is_read && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: "rgba(245,166,35,0.15)", color: "#f5a623", whiteSpace: "nowrap", flexShrink: 0 }}>
                    Unread
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── PENDING APPROVALS ── */}
      {tab === "approvals" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Pending Approvals</h3>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
              {pendingApprovals.length} {pendingApprovals.length === 1 ? "item" : "items"}
            </span>
          </div>
          {pendingApprovals.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No pending approvals</div>
          ) : (
            pendingApprovals.map((t: any) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--border)", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t.item_details}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {t.closure_requested_at && `Requested ${fmt(t.closure_requested_at)}`}
                    {t.target_date && ` · Due ${fmt(t.target_date)}`}
                  </div>
                </div>
                <span className="tag amber">Awaiting Approval</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
