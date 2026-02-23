import { useEffect, useState } from "react";
import { api } from "../api";

export default function EscalationRulesPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newRule, setNewRule] = useState({
    rule_name: "",
    entity_type: "Task",
    condition_json: '{"type":"task_aging_gt","days":20,"notify":"manager"}',
    is_active: true
  });

  useEffect(() => {
    api("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }, []);

  useEffect(() => {
    if (!selectedDashboard) {
      setRules([]);
      setLogs([]);
      return;
    }
    api(`/escalations/rules?dashboard_id=${selectedDashboard}`).then(setRules).catch(() => setRules([]));
    api(`/escalations/logs?dashboard_id=${selectedDashboard}`).then(setLogs).catch(() => setLogs([]));
  }, [selectedDashboard]);

  async function createRule() {
    setError(null);
    try {
      const parsed = JSON.parse(newRule.condition_json);
      await api("/escalations/rules", {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: selectedDashboard,
          entity_type: newRule.entity_type,
          rule_name: newRule.rule_name,
          condition_json: parsed,
          is_active: newRule.is_active
        })
      });
      const updated = await api(`/escalations/rules?dashboard_id=${selectedDashboard}`);
      setRules(updated);
      setNewRule({ rule_name: "", entity_type: "Task", condition_json: '{"type":"task_aging_gt","days":20,"notify":"manager"}', is_active: true });
    } catch (err: any) {
      setError(err.message || "Invalid JSON");
    }
  }

  async function toggleRule(rule: any) {
    await api(`/escalations/rules/${rule.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !rule.is_active })
    });
    const updated = await api(`/escalations/rules?dashboard_id=${selectedDashboard}`);
    setRules(updated);
  }

  return (
    <div>
      <h1>Escalation Rules</h1>
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
      </div>

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Create Rule (Advanced)</h3>
          <div className="form-row">
            <input className="input" placeholder="Rule name" value={newRule.rule_name} onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })} />
            <select className="select" value={newRule.entity_type} onChange={(e) => setNewRule({ ...newRule, entity_type: e.target.value })}>
              <option value="Task">Task</option>
              <option value="Risk">Risk</option>
              <option value="Decision">Decision</option>
            </select>
          </div>
          <textarea
            className="input"
            style={{ minHeight: 140, marginTop: 12 }}
            value={newRule.condition_json}
            onChange={(e) => setNewRule({ ...newRule, condition_json: e.target.value })}
          />
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button className="button" onClick={createRule} disabled={!selectedDashboard}>Create Rule</button>
          </div>
          <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>
            Examples: {`{ "type": "task_aging_gt", "days": 20, "notify": "manager" }`} | {`{ "type": "critical_risk" }`} | {`{ "type": "decision_overdue_gt", "days": 5 }`}
          </div>
        </div>

        <div className="card">
          <h3>Active Rules</h3>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.rule_name}</td>
                  <td>{r.entity_type}</td>
                  <td><span className="badge">{r.is_active ? "Active" : "Inactive"}</span></td>
                  <td><button className="button" onClick={() => toggleRule(r)}>{r.is_active ? "Disable" : "Enable"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Escalation Log</h3>
        <table className="table">
          <thead>
            <tr><th>Entity</th><th>Rule</th><th>Message</th><th>At</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.entity_type}</td>
                <td>{l.rule_name}</td>
                <td>{l.message}</td>
                <td>{l.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
