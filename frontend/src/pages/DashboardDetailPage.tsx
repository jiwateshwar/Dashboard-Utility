import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function DashboardDetailPage() {
  const { id } = useParams();
  const [summary, setSummary] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    api(`/dashboards/${id}/summary`).then(setSummary);
    api(`/tasks?dashboard_id=${id}`).then(setTasks);
    api(`/risks?dashboard_id=${id}`).then(setRisks);
    api(`/decisions?dashboard_id=${id}`).then(setDecisions);
  }, [id]);

  if (!id) return null;

  return (
    <div>
      <h1>Dashboard Overview</h1>
      {summary && (
        <div className="grid three" style={{ marginBottom: 24 }}>
          <div className="card">
            <h3>Tasks</h3>
            <div>Open: {summary.taskStats.open}</div>
            <div>In Progress: {summary.taskStats.inProgress}</div>
            <div>Pending Approval: {summary.taskStats.pendingApproval}</div>
          </div>
          <div className="card">
            <h3>Risks</h3>
            <div>Total Active: {summary.riskStats.totalActive}</div>
            <div>Red Risks: {summary.riskStats.red}</div>
            <div>Overdue Mitigations: {summary.riskStats.overdueMitigations}</div>
          </div>
          <div className="card">
            <h3>Decisions</h3>
            <div>Pending: {summary.decisionStats.pending}</div>
            <div>Overdue: {summary.decisionStats.overdue}</div>
            <div>Health Score: {summary.healthScore}</div>
          </div>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h3>Tasks</h3>
          {tasks.slice(0, 6).map((t) => (
            <div key={t.id} style={{ marginBottom: 8 }}>
              <strong>{t.item_details}</strong>
              <div style={{ color: "#9aa5b1" }}>{t.status}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Risks</h3>
          {risks.slice(0, 6).map((r) => (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <strong>{r.risk_title}</strong>
              <div style={{ color: "#9aa5b1" }}>{r.impact_level} / {r.probability}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Decisions</h3>
          {decisions.slice(0, 6).map((d) => (
            <div key={d.id} style={{ marginBottom: 8 }}>
              <strong>{d.decision_title}</strong>
              <div style={{ color: "#9aa5b1" }}>{d.status}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
