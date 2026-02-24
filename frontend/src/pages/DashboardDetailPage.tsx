import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Mode = "view" | "edit";

const RAG_CLASS: Record<string, string> = { Green: "green", Amber: "amber", Red: "red" };
const IMPACT_CLASS: Record<string, string> = { Low: "green", Medium: "amber", High: "red", Critical: "red" };
const DECISION_STATUS_CLASS: Record<string, string> = { Pending: "amber", Approved: "green", Rejected: "red", Deferred: "amber" };
const TASK_STATUS_CLASS: Record<string, string> = { Open: "amber", "In Progress": "green", "Closed Pending Approval": "amber", "Closed Accepted": "green" };

function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

export default function DashboardDetailPage() {
  const { id } = useParams();
  const [mode, setMode] = useState<Mode>("view");
  const [dashboard, setDashboard] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(true);
  const [taskEdits, setTaskEdits] = useState<Record<string, any>>({});
  const [riskEdits, setRiskEdits] = useState<Record<string, any>>({});
  const [decisionEdits, setDecisionEdits] = useState<Record<string, any>>({});

  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateRisk, setShowCreateRisk] = useState(false);
  const [showCreateDecision, setShowCreateDecision] = useState(false);

  const [newTask, setNewTask] = useState({
    category_id: "", account_id: "", item_details: "", owner_id: "",
    target_date: "", sla_days: "", rag_status: "Green", publish_flag: false
  });
  const [newRisk, setNewRisk] = useState({
    account_id: "", risk_title: "", risk_description: "", risk_owner: "",
    impact_level: "Medium", probability: "Medium", mitigation_plan: "",
    target_mitigation_date: "", publish_flag: false
  });
  const [newDecision, setNewDecision] = useState({
    account_id: "", decision_title: "", decision_context: "", decision_owner: "",
    decision_deadline: "", impact_area: "", publish_flag: false
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api(`/dashboards/${id}`),
      api(`/dashboards/${id}/summary`),
      api(`/tasks?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/risks?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/decisions?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/accounts`),
      api(`/categories?dashboard_id=${id}`),
      api(`/users`)
    ])
      .then(([db, s, t, r, d, a, c, u]) => {
        setDashboard(db); setSummary(s); setTasks(t); setRisks(r);
        setDecisions(d); setAccounts(a); setCategories(c); setUsers(u);
      })
      .catch((err: any) => setError(err.message || "Failed to load"));
  }, [id, showArchived]);

  const accountOptions = useMemo(() => accounts.filter((a) => a.is_active !== false), [accounts]);
  const categoryOptions = useMemo(() => categories.filter((c) => c.is_active !== false), [categories]);

  // Lookup helpers for view mode
  const acctName = (aid: string) => accounts.find((a) => a.id === aid)?.account_name ?? "—";
  const catName = (cid: string) => categories.find((c) => c.id === cid)?.name ?? "—";
  const ownerName = (uid: string) => users.find((u) => u.id === uid)?.name ?? "—";

  async function refresh() {
    if (!id) return;
    const [t, r, d, s] = await Promise.all([
      api(`/tasks?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/risks?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/decisions?dashboard_id=${id}&include_archived=${showArchived}`),
      api(`/dashboards/${id}/summary`)
    ]);
    setTasks(t); setRisks(r); setDecisions(d); setSummary(s);
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
      setShowCreateTask(false);
      await refresh();
    } catch (err: any) { setError(err.message); }
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
      setShowCreateRisk(false);
      await refresh();
    } catch (err: any) { setError(err.message); }
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
      setShowCreateDecision(false);
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function saveTask(taskId: string) {
    const payload = taskEdits[taskId];
    if (!payload) return;
    try {
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setTaskEdits((prev) => { const c = { ...prev }; delete c[taskId]; return c; });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function requestTaskClose(taskId: string) {
    try {
      await api(`/tasks/${taskId}/close-request`, { method: "POST" });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function approveTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}/approve`, { method: "POST" });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function saveRisk(riskId: string) {
    const payload = riskEdits[riskId];
    if (!payload) return;
    try {
      await api(`/risks/${riskId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setRiskEdits((prev) => { const c = { ...prev }; delete c[riskId]; return c; });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function saveDecision(decisionId: string) {
    const payload = decisionEdits[decisionId];
    if (!payload) return;
    try {
      await api(`/decisions/${decisionId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setDecisionEdits((prev) => { const c = { ...prev }; delete c[decisionId]; return c; });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  if (!id) return null;

  return (
    <div className="dashboard-shell">
      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      {/* Header */}
      <div className="dashboard-header">
        <h1>{dashboard?.name ?? "Loading…"}</h1>
        {dashboard?.description && (
          <div className="dashboard-subtitle">{dashboard.description}</div>
        )}
      </div>

      {/* KPI strip — always visible */}
      {summary && (
        <div className="kpi-strip" style={{ marginTop: 12 }}>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-value" style={{ color: "#1d63ed" }}>{summary.taskStats.open}</div>
              <div className="kpi-label">Open Tasks</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value" style={{ color: "#e53935" }}>{summary.taskStats.red}</div>
              <div className="kpi-label">Red Tasks</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value" style={{ color: "#2ebd85" }}>{summary.riskStats.totalActive}</div>
              <div className="kpi-label">Active Risks</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value" style={{ color: "#f5a623" }}>{summary.decisionStats.pending}</div>
              <div className="kpi-label">Decisions Pending</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value" style={{ color: "#6366f1" }}>{summary.healthScore}</div>
              <div className="kpi-label">Health Score</div>
            </div>
          </div>
        </div>
      )}

      {/* Mode tabs */}
      <div className="tab-bar">
        <button className={`tab${mode === "view" ? " active" : ""}`} onClick={() => setMode("view")}>Overview</button>
        <button className={`tab${mode === "edit" ? " active" : ""}`} onClick={() => setMode("edit")}>Manage</button>
      </div>

      {/* ── VIEW MODE ── */}
      {mode === "view" && (
        <>
          {/* Summary sections */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <div className="section accent-blue">
              <h3 className="section-title">✨ Highlights</h3>
              <div className="section-body">
                <ul>{tasks.slice(0, 4).map((t) => <li key={t.id}>{t.item_details}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-amber">
              <h3 className="section-title">🔶 Decisions Needed</h3>
              <div className="section-body">
                <ul>{decisions.slice(0, 4).map((d) => <li key={d.id}>{d.decision_title}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-red">
              <h3 className="section-title">⚠️ Risks & Issues</h3>
              <div className="section-body">
                <ul>{risks.slice(0, 5).map((r) => <li key={r.id}>{r.risk_title}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-green">
              <h3 className="section-title">⏭️ Next Priorities</h3>
              <div className="section-body">
                <ul>{tasks.slice(0, 5).map((t) => <li key={t.id}>{t.item_details}</li>)}</ul>
              </div>
            </div>
          </div>

          {/* Tasks — read-only */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Tasks</h3>
            <table className="table">
              <thead>
                <tr><th>Task</th><th>Category</th><th>Account</th><th>Owner</th><th>Target</th><th>SLA</th><th>RAG</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.item_details}</td>
                    <td>{catName(t.category_id)}</td>
                    <td>{acctName(t.account_id)}</td>
                    <td>{ownerName(t.owner_id)}</td>
                    <td>{fmt(t.target_date)}</td>
                    <td>{t.sla_days ?? "—"}</td>
                    <td><span className={`tag ${RAG_CLASS[t.rag_status] ?? "green"}`}>{t.rag_status}</span></td>
                    <td><span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span></td>
                  </tr>
                ))}
                {tasks.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted)", textAlign: "center" }}>No tasks</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Risks — read-only */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Risks</h3>
            <table className="table">
              <thead>
                <tr><th>Risk</th><th>Account</th><th>Owner</th><th>Impact</th><th>Probability</th><th>Mitigation Target</th><th>Status</th></tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.risk_title}</div>
                      {r.risk_description && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{r.risk_description}</div>}
                    </td>
                    <td>{acctName(r.account_id)}</td>
                    <td>{ownerName(r.risk_owner)}</td>
                    <td><span className={`tag ${IMPACT_CLASS[r.impact_level] ?? "amber"}`}>{r.impact_level}</span></td>
                    <td>{r.probability}</td>
                    <td>{fmt(r.target_mitigation_date)}</td>
                    <td><span className={`tag ${r.status === "Closed" ? "green" : r.status === "Mitigated" ? "green" : "amber"}`}>{r.status}</span></td>
                  </tr>
                ))}
                {risks.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center" }}>No risks</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Decisions — read-only */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Decisions</h3>
            <table className="table">
              <thead>
                <tr><th>Decision</th><th>Account</th><th>Owner</th><th>Deadline</th><th>Impact Area</th><th>Status</th></tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{d.decision_title}</div>
                      {d.decision_context && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{d.decision_context}</div>}
                    </td>
                    <td>{acctName(d.account_id)}</td>
                    <td>{ownerName(d.decision_owner)}</td>
                    <td>{fmt(d.decision_deadline)}</td>
                    <td>{d.impact_area || "—"}</td>
                    <td><span className={`tag ${DECISION_STATUS_CLASS[d.status] ?? "amber"}`}>{d.status}</span></td>
                  </tr>
                ))}
                {decisions.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)", textAlign: "center" }}>No decisions</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── EDIT MODE ── */}
      {mode === "edit" && (
        <>
          <div className="inline-actions" style={{ marginBottom: 16 }}>
            <label className="badge">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show Archived
            </label>
          </div>

          {/* Tasks — editable */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Tasks</h3>
              <button className="button" onClick={() => setShowCreateTask((v) => !v)}>
                {showCreateTask ? "Cancel" : "+ Add Task"}
              </button>
            </div>

            {showCreateTask && (
              <div className="inline-create-panel">
                <div className="form-row">
                  <select className="select" value={newTask.category_id} onChange={(e) => setNewTask({ ...newTask, category_id: e.target.value })}>
                    <option value="">Category</option>
                    {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="select" value={newTask.account_id} onChange={(e) => setNewTask({ ...newTask, account_id: e.target.value })}>
                    <option value="">Account</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newTask.owner_id} onChange={(e) => setNewTask({ ...newTask, owner_id: e.target.value })}>
                    <option value="">Owner</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input className="input" type="date" value={newTask.target_date} onChange={(e) => setNewTask({ ...newTask, target_date: e.target.value })} />
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
            )}

            <table className="table">
              <thead>
                <tr><th>Task</th><th>Category</th><th>Account</th><th>Owner</th><th>Target</th><th>SLA</th><th>Publish</th><th>Status</th><th>RAG</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input className="input" value={taskEdits[t.id]?.item_details ?? t.item_details}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], item_details: e.target.value } }))} />
                    </td>
                    <td>
                      <select className="select" value={taskEdits[t.id]?.category_id ?? t.category_id}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], category_id: e.target.value } }))}>
                        <option value="">Category</option>
                        {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={taskEdits[t.id]?.account_id ?? t.account_id}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], account_id: e.target.value } }))}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={taskEdits[t.id]?.owner_id ?? t.owner_id}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], owner_id: e.target.value } }))}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="input" type="date"
                        value={taskEdits[t.id]?.target_date ?? (t.target_date?.slice?.(0, 10) || "")}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], target_date: e.target.value } }))} />
                    </td>
                    <td>
                      <input className="input" value={taskEdits[t.id]?.sla_days ?? (t.sla_days ?? "")}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], sla_days: e.target.value } }))} />
                    </td>
                    <td>
                      <input type="checkbox" checked={taskEdits[t.id]?.publish_flag ?? t.publish_flag}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], publish_flag: e.target.checked } }))} />
                    </td>
                    <td>
                      <select className="select" value={taskEdits[t.id]?.status ?? t.status}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], status: e.target.value } }))}>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed Pending Approval">Closed Pending Approval</option>
                        <option value="Closed Accepted">Closed Accepted</option>
                      </select>
                    </td>
                    <td>
                      <select className="select" value={taskEdits[t.id]?.rag_status ?? t.rag_status}
                        onChange={(e) => setTaskEdits((prev) => ({ ...prev, [t.id]: { ...prev[t.id], rag_status: e.target.value } }))}>
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

          {/* Risks — editable */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Risks</h3>
              <button className="button" onClick={() => setShowCreateRisk((v) => !v)}>
                {showCreateRisk ? "Cancel" : "+ Add Risk"}
              </button>
            </div>

            {showCreateRisk && (
              <div className="inline-create-panel">
                <div className="form-row">
                  <select className="select" value={newRisk.account_id} onChange={(e) => setNewRisk({ ...newRisk, account_id: e.target.value })}>
                    <option value="">Account</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newRisk.risk_owner} onChange={(e) => setNewRisk({ ...newRisk, risk_owner: e.target.value })}>
                    <option value="">Owner</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select className="select" value={newRisk.impact_level} onChange={(e) => setNewRisk({ ...newRisk, impact_level: e.target.value })}>
                    <option value="Low">Low</option><option value="Medium">Medium</option>
                    <option value="High">High</option><option value="Critical">Critical</option>
                  </select>
                  <select className="select" value={newRisk.probability} onChange={(e) => setNewRisk({ ...newRisk, probability: e.target.value })}>
                    <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                  </select>
                  <input className="input" type="date" value={newRisk.target_mitigation_date} onChange={(e) => setNewRisk({ ...newRisk, target_mitigation_date: e.target.value })} />
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
            )}

            <table className="table">
              <thead>
                <tr><th>Risk</th><th>Account</th><th>Owner</th><th>Impact</th><th>Prob.</th><th>Mitigation</th><th>Target</th><th>Publish</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input className="input" value={riskEdits[r.id]?.risk_title ?? r.risk_title}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], risk_title: e.target.value } }))} />
                      <input className="input" value={riskEdits[r.id]?.risk_description ?? (r.risk_description || "")}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], risk_description: e.target.value } }))}
                        style={{ marginTop: 6 }} />
                    </td>
                    <td>
                      <select className="select" value={riskEdits[r.id]?.account_id ?? r.account_id}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], account_id: e.target.value } }))}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={riskEdits[r.id]?.risk_owner ?? r.risk_owner}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], risk_owner: e.target.value } }))}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={riskEdits[r.id]?.impact_level ?? r.impact_level}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], impact_level: e.target.value } }))}>
                        <option value="Low">Low</option><option value="Medium">Medium</option>
                        <option value="High">High</option><option value="Critical">Critical</option>
                      </select>
                    </td>
                    <td>
                      <select className="select" value={riskEdits[r.id]?.probability ?? r.probability}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], probability: e.target.value } }))}>
                        <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                      </select>
                    </td>
                    <td>
                      <input className="input" value={riskEdits[r.id]?.mitigation_plan ?? (r.mitigation_plan || "")}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], mitigation_plan: e.target.value } }))} />
                    </td>
                    <td>
                      <input className="input" type="date"
                        value={riskEdits[r.id]?.target_mitigation_date ?? (r.target_mitigation_date?.slice?.(0, 10) || "")}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], target_mitigation_date: e.target.value } }))} />
                    </td>
                    <td>
                      <input type="checkbox" checked={riskEdits[r.id]?.publish_flag ?? r.publish_flag}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], publish_flag: e.target.checked } }))} />
                    </td>
                    <td>
                      <select className="select" value={riskEdits[r.id]?.status ?? r.status}
                        onChange={(e) => setRiskEdits((prev) => ({ ...prev, [r.id]: { ...prev[r.id], status: e.target.value } }))}>
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

          {/* Decisions — editable */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Decisions</h3>
              <button className="button" onClick={() => setShowCreateDecision((v) => !v)}>
                {showCreateDecision ? "Cancel" : "+ Add Decision"}
              </button>
            </div>

            {showCreateDecision && (
              <div className="inline-create-panel">
                <div className="form-row">
                  <select className="select" value={newDecision.account_id} onChange={(e) => setNewDecision({ ...newDecision, account_id: e.target.value })}>
                    <option value="">Account</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newDecision.decision_owner} onChange={(e) => setNewDecision({ ...newDecision, decision_owner: e.target.value })}>
                    <option value="">Owner</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input className="input" type="date" value={newDecision.decision_deadline} onChange={(e) => setNewDecision({ ...newDecision, decision_deadline: e.target.value })} />
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
            )}

            <table className="table">
              <thead>
                <tr><th>Decision</th><th>Account</th><th>Owner</th><th>Deadline</th><th>Publish</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input className="input" value={decisionEdits[d.id]?.decision_title ?? d.decision_title}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], decision_title: e.target.value } }))} />
                      <input className="input" value={decisionEdits[d.id]?.decision_context ?? (d.decision_context || "")}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], decision_context: e.target.value } }))}
                        style={{ marginTop: 6 }} />
                    </td>
                    <td>
                      <select className="select" value={decisionEdits[d.id]?.account_id ?? d.account_id}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], account_id: e.target.value } }))}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={decisionEdits[d.id]?.decision_owner ?? d.decision_owner}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], decision_owner: e.target.value } }))}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="input" type="date"
                        value={decisionEdits[d.id]?.decision_deadline ?? (d.decision_deadline?.slice?.(0, 10) || "")}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], decision_deadline: e.target.value } }))} />
                    </td>
                    <td>
                      <input type="checkbox" checked={decisionEdits[d.id]?.publish_flag ?? d.publish_flag}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], publish_flag: e.target.checked } }))} />
                    </td>
                    <td>
                      <select className="select" value={decisionEdits[d.id]?.status ?? d.status}
                        onChange={(e) => setDecisionEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], status: e.target.value } }))}>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Deferred">Deferred</option>
                      </select>
                    </td>
                    <td className="inline-actions">
                      <button className="button" onClick={() => saveDecision(d.id)}>Save</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
