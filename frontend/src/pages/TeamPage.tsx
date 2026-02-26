import { useEffect, useState } from "react";
import { api } from "../api";

export default function TeamPage() {
  const [data, setData] = useState<any>(null);
  const [showOverdue, setShowOverdue] = useState(false);
  const [showRed, setShowRed] = useState(false);

  useEffect(() => {
    api("/team").then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;

  const filteredTasks = data.tasks.filter((t: any) => {
    const closed = ["Closed Accepted", "Closed Pending Approval"];
    if (showRed && (!t.target_date || closed.includes(t.status) || new Date(t.target_date).getTime() >= Date.now())) return false;
    if (showOverdue && t.target_date) {
      return new Date(t.target_date).getTime() < Date.now();
    }
    return true;
  });
  const filteredRisks = data.risks.filter((r: any) => {
    if (showRed && r.impact_level !== "Critical") return false;
    if (showOverdue && r.target_mitigation_date) {
      return new Date(r.target_mitigation_date).getTime() < Date.now();
    }
    return true;
  });
  const filteredDecisions = data.decisions.filter((d: any) => {
    if (showOverdue && d.decision_deadline) {
      return new Date(d.decision_deadline).getTime() < Date.now();
    }
    return true;
  });

  return (
    <div>
      <h1>Team View</h1>
      <div className="inline-actions" style={{ marginBottom: 12 }}>
        <label className="badge">
          <input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} /> Overdue Only
        </label>
        <label className="badge">
          <input type="checkbox" checked={showRed} onChange={(e) => setShowRed(e.target.checked)} /> Overdue Tasks / Critical Risks
        </label>
      </div>
      <div className="grid two">
        <div className="card">
          <h3>Tasks</h3>
          {filteredTasks.map((t: any) => (
            <div key={t.id}>{t.item_details}</div>
          ))}
        </div>
        <div className="card">
          <h3>Risks</h3>
          {filteredRisks.map((r: any) => (
            <div key={r.id}>{r.risk_title}</div>
          ))}
        </div>
        <div className="card">
          <h3>Decisions</h3>
          {filteredDecisions.map((d: any) => (
            <div key={d.id}>{d.decision_title}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
