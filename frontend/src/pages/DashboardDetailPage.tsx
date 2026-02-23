import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

export default function DashboardDetailPage() {
  const { id } = useParams();
  const [summary, setSummary] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [taskEdits, setTaskEdits] = useState<Record<string, any>>({});
  const [riskEdits, setRiskEdits] = useState<Record<string, any>>({});
  const [decisionEdits, setDecisionEdits] = useState<Record<string, any>>({});

  const [newTask, setNewTask] = useState({
    category_id: "",
    account_id: "",
    item_details: "",
    owner_id: "",
    target_date: "",
    sla_days: "",
    rag_status: "Green",
    publish_flag: false
  });

  const [newRisk, setNewRisk] = useState({
    account_id: "",
    risk_title: "",
    risk_description: "",
    risk_owner: "",
    impact_level: "Medium",
    probability: "Medium",
    mitigation_plan: "",
    target_mitigation_date: "",
    publish_flag: false
  });

  const [newDecision, setNewDecision] = useState({
    account_id: "",
    decision_title: "",
    decision_context: "",
    decision_owner: "",
    decision_deadline: "",
    impact_area: "",
    publish_flag: false
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api(`/dashboards/${id}/summary`),
      api(`/tasks?dashboard_id=${id}`),
      api(`/risks?dashboard_id=${id}`),
      api(`/decisions?dashboard_id=${id}`),
      api(`/accounts`),
      api(`/categories?dashboard_id=${id}`),
      api(`/users`)
    ])
      .then(([s, t, r, d, a, c, u]) => {
        setSummary(s);
        setTasks(t);
        setRisks(r);
        setDecisions(d);
        setAccounts(a);
        setCategories(c);
        setUsers(u);
      })
      .catch((err: any) => setError(err.message || "Failed to load"));
  }, [id]);

  const accountOptions = useMemo(() => accounts.filter((a) => a.is_active !== false), [accounts]);
  const categoryOptions = useMemo(() => categories.filter((c) => c.is_active !== false), [categories]);

  async function refresh() {
    if (!id) return;
    const [t, r, d, s] = await Promise.all([
      api(`/tasks?dashboard_id=${id}`),
      api(`/risks?dashboard_id=${id}`),
      api(`/decisions?dashboard_id=${id}`),
      api(`/dashboards/${id}/summary`)
    ]);
    setTasks(t);
    setRisks(r);
    setDecisions(d);
    setSummary(s);
  }

  async function createTask() {
    if (!id) return;
    setError(null);
    try {
      await api(`/tasks`, {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: id,
          category_id: newTask.category_id,
          account_id: newTask.account_id,
          item_details: newTask.item_details,
          owner_id: newTask.owner_id,
          target_date: newTask.target_date,
          sla_days: newTask.sla_days ? Number(newTask.sla_days) : undefined,
          rag_status: newTask.rag_status,
          publish_flag: newTask.publish_flag
        })
      });
      setNewTask({ category_id: "", account_id: "", item_details: "", owner_id: "", target_date: "", sla_days: "", rag_status: "Green", publish_flag: false });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createRisk() {
    if (!id) return;
    setError(null);
    try {
      await api(`/risks`, {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: id,
          account_id: newRisk.account_id,
          risk_title: newRisk.risk_title,
          risk_description: newRisk.risk_description,
          risk_owner: newRisk.risk_owner,
          impact_level: newRisk.impact_level,
          probability: newRisk.probability,
          mitigation_plan: newRisk.mitigation_plan,
          target_mitigation_date: newRisk.target_mitigation_date || null,
          publish_flag: newRisk.publish_flag
        })
      });
      setNewRisk({ account_id: "", risk_title: "", risk_description: "", risk_owner: "", impact_level: "Medium", probability: "Medium", mitigation_plan: "", target_mitigation_date: "", publish_flag: false });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createDecision() {
    if (!id) return;
    setError(null);
    try {
      await api(`/decisions`, {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: id,
          account_id: newDecision.account_id,
          decision_title: newDecision.decision_title,
          decision_context: newDecision.decision_context,
          decision_owner: newDecision.decision_owner,
          decision_deadline: newDecision.decision_deadline,
          impact_area: newDecision.impact_area,
          publish_flag: newDecision.publish_flag
        })
      });
      setNewDecision({ account_id: "", decision_title: "", decision_context: "", decision_owner: "", decision_deadline: "", impact_area: "", publish_flag: false });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveTask(id: string) {
    const payload = taskEdits[id];
    if (!payload) return;
    try {
      await api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setTaskEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function requestTaskClose(id: string) {
    try {
      await api(`/tasks/${id}/close-request`, { method: "POST" });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function approveTask(id: string) {
    try {
      await api(`/tasks/${id}/approve`, { method: "POST" });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveRisk(id: string) {
    const payload = riskEdits[id];
    if (!payload) return;
    try {
      await api(`/risks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setRiskEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function saveDecision(id: string) {
    const payload = decisionEdits[id];
    if (!payload) return;
    try {
      await api(`/decisions/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      setDecisionEdits((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!id) return null;

  return (
    <div>
      <h1>Dashboard Overview</h1>
      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}
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

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Create Task</h3>
          <div className="form-row">
            <select className="select" value={newTask.category_id} onChange={(e) => setNewTask({ ...newTask, category_id: e.target.value })}>
              <option value="">Category</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="select" value={newTask.account_id} onChange={(e) => setNewTask({ ...newTask, account_id: e.target.value })}>
              <option value="">Account</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>
            <select className="select" value={newTask.owner_id} onChange={(e) => setNewTask({ ...newTask, owner_id: e.target.value })}>
              <option value="">Owner</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <input className="input" placeholder="Target date" type="date" value={newTask.target_date} onChange={(e) => setNewTask({ ...newTask, target_date: e.target.value })} />
            <input className="input" placeholder="SLA days" value={newTask.sla_days} onChange={(e) => setNewTask({ ...newTask, sla_days: e.target.value })} />
            <select className="select" value={newTask.rag_status} onChange={(e) => setNewTask({ ...newTask, rag_status: e.target.value })}>
              <option value="Green">Green</option>
              <option value="Amber">Amber</option>
              <option value="Red">Red</option>
            </select>
          </div>
          <input className="input" placeholder="Task details" value={newTask.item_details} onChange={(e) => setNewTask({ ...newTask, item_details: e.target.value })} />
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <label className="badge">
              <input type="checkbox" checked={newTask.publish_flag} onChange={(e) => setNewTask({ ...newTask, publish_flag: e.target.checked })} /> Publish
            </label>
            <button className="button" onClick={createTask}>Create Task</button>
          </div>
        </div>

        <div className="card">
          <h3>Create Risk</h3>
          <div className="form-row">
            <select className="select" value={newRisk.account_id} onChange={(e) => setNewRisk({ ...newRisk, account_id: e.target.value })}>
              <option value="">Account</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>
            <select className="select" value={newRisk.risk_owner} onChange={(e) => setNewRisk({ ...newRisk, risk_owner: e.target.value })}>
              <option value="">Owner</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select className="select" value={newRisk.impact_level} onChange={(e) => setNewRisk({ ...newRisk, impact_level: e.target.value })}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <select className="select" value={newRisk.probability} onChange={(e) => setNewRisk({ ...newRisk, probability: e.target.value })}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <input className="input" type="date" placeholder="Mitigation date" value={newRisk.target_mitigation_date} onChange={(e) => setNewRisk({ ...newRisk, target_mitigation_date: e.target.value })} />
          </div>
          <input className="input" placeholder="Risk title" value={newRisk.risk_title} onChange={(e) => setNewRisk({ ...newRisk, risk_title: e.target.value })} />
          <input className="input" placeholder="Risk description" value={newRisk.risk_description} onChange={(e) => setNewRisk({ ...newRisk, risk_description: e.target.value })} style={{ marginTop: 8 }} />
          <input className="input" placeholder="Mitigation plan" value={newRisk.mitigation_plan} onChange={(e) => setNewRisk({ ...newRisk, mitigation_plan: e.target.value })} style={{ marginTop: 8 }} />
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <label className="badge">
              <input type="checkbox" checked={newRisk.publish_flag} onChange={(e) => setNewRisk({ ...newRisk, publish_flag: e.target.checked })} /> Publish
            </label>
            <button className="button" onClick={createRisk}>Create Risk</button>
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Create Decision</h3>
          <div className="form-row">
            <select className="select" value={newDecision.account_id} onChange={(e) => setNewDecision({ ...newDecision, account_id: e.target.value })}>
              <option value="">Account</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>
            <select className="select" value={newDecision.decision_owner} onChange={(e) => setNewDecision({ ...newDecision, decision_owner: e.target.value })}>
              <option value="">Owner</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <input className="input" type="date" placeholder="Deadline" value={newDecision.decision_deadline} onChange={(e) => setNewDecision({ ...newDecision, decision_deadline: e.target.value })} />
            <input className="input" placeholder="Impact area" value={newDecision.impact_area} onChange={(e) => setNewDecision({ ...newDecision, impact_area: e.target.value })} />
          </div>
          <input className="input" placeholder="Decision title" value={newDecision.decision_title} onChange={(e) => setNewDecision({ ...newDecision, decision_title: e.target.value })} />
          <input className="input" placeholder="Decision context" value={newDecision.decision_context} onChange={(e) => setNewDecision({ ...newDecision, decision_context: e.target.value })} style={{ marginTop: 8 }} />
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <label className="badge">
              <input type="checkbox" checked={newDecision.publish_flag} onChange={(e) => setNewDecision({ ...newDecision, publish_flag: e.target.checked })} /> Publish
            </label>
            <button className="button" onClick={createDecision}>Create Decision</button>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Tasks</h3>
          <table className="table">
            <thead>
              <tr><th>Task</th><th>Status</th><th>Owner</th><th>RAG</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.item_details}</td>
                  <td>
                    <select
                      className="select"
                      value={taskEdits[t.id]?.status ?? t.status}
                      onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], status: e.target.value } }))}
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Closed Pending Approval">Closed Pending Approval</option>
                      <option value="Closed Accepted">Closed Accepted</option>
                    </select>
                  </td>
                  <td>{t.owner_name}</td>
                  <td>
                    <select
                      className="select"
                      value={taskEdits[t.id]?.rag_status ?? t.rag_status}
                      onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], rag_status: e.target.value } }))}
                    >
                      <option value="Green">Green</option>
                      <option value="Amber">Amber</option>
                      <option value="Red">Red</option>
                    </select>
                  </td>
                  <td className="inline-actions">
                    <button className="button" onClick={() => saveTask(t.id)}>Save</button>
                    <button className="button" onClick={() => requestTaskClose(t.id)}>Request Close</button>
                    <button className="button" onClick={() => approveTask(t.id)}>Approve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Risks</h3>
          <table className="table">
            <thead>
              <tr><th>Risk</th><th>Impact</th><th>Owner</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <td>{r.risk_title}</td>
                  <td>{r.impact_level}/{r.probability}</td>
                  <td>{r.owner_name}</td>
                  <td>
                    <select
                      className="select"
                      value={riskEdits[r.id]?.status ?? r.status}
                      onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], status: e.target.value } }))}
                    >
                      <option value="Open">Open</option>
                      <option value="Mitigated">Mitigated</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </td>
                  <td className="inline-actions">
                    <button className="button" onClick={() => saveRisk(r.id)}>Save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Decisions</h3>
          <table className="table">
            <thead>
              <tr><th>Decision</th><th>Owner</th><th>Status</th><th>Deadline</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td>{d.decision_title}</td>
                  <td>{d.owner_name}</td>
                  <td>
                    <select
                      className="select"
                      value={decisionEdits[d.id]?.status ?? d.status}
                      onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], status: e.target.value } }))}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Deferred">Deferred</option>
                    </select>
                  </td>
                  <td>{d.decision_deadline}</td>
                  <td className="inline-actions">
                    <button className="button" onClick={() => saveDecision(d.id)}>Save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
