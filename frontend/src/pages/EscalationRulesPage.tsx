import { useEffect, useState } from "react";
import { api } from "../api";

const ruleTemplates = [
  { label: "Task aging > days (notify manager)", type: "task_aging_gt", entity: "Task" },
  { label: "Critical risk (notify owner)", type: "critical_risk", entity: "Risk" },
  { label: "Decision overdue > days (notify owner)", type: "decision_overdue_gt", entity: "Decision" }
];

export default function EscalationRulesPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newRule, setNewRule] = useState({
    rule_name: "",
    template: ruleTemplates[0].type,
    days: "20",
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
      const template = ruleTemplates.find((t) => t.type === newRule.template) || ruleTemplates[0];
      const condition_json: any = { type: template.type };
      if (template.type === "task_aging_gt" || template.type === "decision_overdue_gt") {
        condition_json.days = Number(newRule.days || "0");
        condition_json.notify = "manager";
      }
      await api("/escalations/rules", {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: selectedDashboard,
          entity_type: template.entity,
          rule_name: newRule.rule_name || template.label,
          condition_json,
          is_active: newRule.is_active
        })
      });
      const updated = await api(`/escalations/rules?dashboard_id=${selectedDashboard}`);
      setRules(updated);
      setNewRule({ rule_name: "", template: ruleTemplates[0].type, days: "20", is_active: true });
    } catch (err: any) {
      setError(err.message);
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
          <h3>Create Rule</h3>
          <div className="form-row">
            <select className="select" value={newRule.template} onChange={(e) => setNewRule({ ...newRule, template: e.target.value })}>
              {ruleTemplates.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <input className="input" placeholder="Rule name" value={newRule.rule_name} onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })} />
            {(newRule.template === "task_aging_gt" || newRule.template === "decision_overdue_gt") && (
              <input className="input" placeholder="Days" value={newRule.days} onChange={(e) => setNewRule({ ...newRule, days: e.target.value })} />
            )}
          </div>
          <button className="button" onClick={createRule} disabled={!selectedDashboard}>Create Rule</button>
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
