import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";

type Mode = "view" | "edit";

const RAG_CLASS: Record<string, string> = { Green: "green", Amber: "amber", Red: "red" };
const IMPACT_CLASS: Record<string, string> = { Low: "green", Medium: "amber", High: "red", Critical: "red" };
const DECISION_STATUS_CLASS: Record<string, string> = { Pending: "amber", Approved: "green", Rejected: "red", Deferred: "amber" };
const TASK_STATUS_CLASS: Record<string, string> = { Open: "amber", "In Progress": "green", "Closed Pending Approval": "amber", "Closed Accepted": "green" };
const RAG_DOT: Record<string, string> = { Green: "#2ebd85", Amber: "#f5a623", Red: "#e53935" };

function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  return dateStr.slice(0, 10);
}

const EMPTY_TASK = {
  category_id: "", account_id: "", item_details: "", owner_id: "",
  target_date: "", sla_days: "", rag_status: "Green", status: "Open", publish_flag: false
};
const EMPTY_RISK = {
  account_id: "", risk_title: "", risk_description: "", risk_owner: "",
  impact_level: "Medium", probability: "Medium", mitigation_plan: "",
  target_mitigation_date: "", status: "Open", publish_flag: false
};
const EMPTY_DECISION = {
  account_id: "", decision_title: "", decision_context: "", decision_owner: "",
  decision_deadline: "", impact_area: "", status: "Pending", publish_flag: false
};

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
  const [showArchived, setShowArchived] = useState(false);

  // Create form state
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateRisk, setShowCreateRisk] = useState(false);
  const [showCreateDecision, setShowCreateDecision] = useState(false);
  const [newTask, setNewTask] = useState({ ...EMPTY_TASK });
  const [newRisk, setNewRisk] = useState({ ...EMPTY_RISK });
  const [newDecision, setNewDecision] = useState({ ...EMPTY_DECISION });

  // Inline edit state — only one item open at a time per type
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState<any>({});
  const [riskEditForm, setRiskEditForm] = useState<any>({});
  const [decisionEditForm, setDecisionEditForm] = useState<any>({});

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

  // ── Create handlers ─────────────────────────────────────────

  async function createTask() {
    if (!id) return;
    setError(null);
    try {
      await api(`/tasks`, {
        method: "POST",
        body: JSON.stringify({ dashboard_id: id, ...newTask, sla_days: newTask.sla_days ? Number(newTask.sla_days) : undefined })
      });
      setNewTask({ ...EMPTY_TASK });
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
        body: JSON.stringify({ dashboard_id: id, ...newRisk, target_mitigation_date: newRisk.target_mitigation_date || null })
      });
      setNewRisk({ ...EMPTY_RISK });
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
        body: JSON.stringify({ dashboard_id: id, ...newDecision })
      });
      setNewDecision({ ...EMPTY_DECISION });
      setShowCreateDecision(false);
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  // ── Save handlers ────────────────────────────────────────────

  async function saveTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(taskEditForm) });
      setEditingTaskId(null);
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function saveRisk(riskId: string) {
    try {
      await api(`/risks/${riskId}`, { method: "PATCH", body: JSON.stringify(riskEditForm) });
      setEditingRiskId(null);
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function saveDecision(decisionId: string) {
    try {
      await api(`/decisions/${decisionId}`, { method: "PATCH", body: JSON.stringify(decisionEditForm) });
      setEditingDecisionId(null);
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  // ── Delete handlers ──────────────────────────────────────────

  async function deleteTask(taskId: string) {
    if (!confirm("Permanently delete this task?")) return;
    try {
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function deleteRisk(riskId: string) {
    if (!confirm("Permanently delete this risk?")) return;
    try {
      await api(`/risks/${riskId}`, { method: "DELETE" });
      await refresh();
    } catch (err: any) { setError(err.message); }
  }

  async function deleteDecision(decisionId: string) {
    if (!confirm("Permanently delete this decision?")) return;
    try {
      await api(`/decisions/${decisionId}`, { method: "DELETE" });
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

  function openEditTask(t: any) {
    setEditingTaskId(t.id);
    setTaskEditForm({
      item_details: t.item_details,
      category_id: t.category_id,
      account_id: t.account_id,
      owner_id: t.owner_id,
      target_date: t.target_date?.slice(0, 10) || "",
      sla_days: t.sla_days ?? "",
      rag_status: t.rag_status,
      status: t.status,
      publish_flag: t.publish_flag
    });
  }

  function openEditRisk(r: any) {
    setEditingRiskId(r.id);
    setRiskEditForm({
      risk_title: r.risk_title,
      risk_description: r.risk_description || "",
      account_id: r.account_id,
      risk_owner: r.risk_owner,
      impact_level: r.impact_level,
      probability: r.probability,
      mitigation_plan: r.mitigation_plan || "",
      target_mitigation_date: r.target_mitigation_date?.slice(0, 10) || "",
      status: r.status,
      publish_flag: r.publish_flag
    });
  }

  function openEditDecision(d: any) {
    setEditingDecisionId(d.id);
    setDecisionEditForm({
      decision_title: d.decision_title,
      decision_context: d.decision_context || "",
      account_id: d.account_id,
      decision_owner: d.decision_owner,
      decision_deadline: d.decision_deadline?.slice(0, 10) || "",
      impact_area: d.impact_area || "",
      status: d.status,
      publish_flag: d.publish_flag
    });
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

      {/* KPI strip */}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            <div className="section accent-blue">
              <h3 className="section-title">Highlights</h3>
              <div className="section-body">
                <ul>{tasks.slice(0, 4).map((t) => <li key={t.id}>{t.item_details}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-amber">
              <h3 className="section-title">Decisions Needed</h3>
              <div className="section-body">
                <ul>{decisions.slice(0, 4).map((d) => <li key={d.id}>{d.decision_title}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-red">
              <h3 className="section-title">Risks &amp; Issues</h3>
              <div className="section-body">
                <ul>{risks.slice(0, 5).map((r) => <li key={r.id}>{r.risk_title}</li>)}</ul>
              </div>
            </div>
            <div className="section accent-green">
              <h3 className="section-title">Next Priorities</h3>
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
                <tr><th>Task</th><th>Category</th><th>Account</th><th>Owner</th><th>Target</th><th>RAG</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.item_details}</td>
                    <td>{catName(t.category_id)}</td>
                    <td>{acctName(t.account_id)}</td>
                    <td>{ownerName(t.owner_id)}</td>
                    <td>{fmt(t.target_date)}</td>
                    <td><span className={`tag ${RAG_CLASS[t.rag_status] ?? "green"}`}>{t.rag_status}</span></td>
                    <td><span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span></td>
                  </tr>
                ))}
                {tasks.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center" }}>No tasks</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Risks — read-only */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Risks</h3>
            <table className="table">
              <thead>
                <tr><th>Risk</th><th>Account</th><th>Owner</th><th>Impact</th><th>Probability</th><th>Target</th><th>Status</th></tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.risk_title}</div>
                      {r.risk_description && <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.risk_description}</div>}
                    </td>
                    <td>{acctName(r.account_id)}</td>
                    <td>{ownerName(r.risk_owner)}</td>
                    <td><span className={`tag ${IMPACT_CLASS[r.impact_level] ?? "amber"}`}>{r.impact_level}</span></td>
                    <td>{r.probability}</td>
                    <td>{fmt(r.target_mitigation_date)}</td>
                    <td><span className={`tag ${r.status === "Closed" || r.status === "Mitigated" ? "green" : "amber"}`}>{r.status}</span></td>
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
                      {d.decision_context && <div style={{ color: "var(--muted)", fontSize: 12 }}>{d.decision_context}</div>}
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

      {/* ── MANAGE MODE ── */}
      {mode === "edit" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} style={{ marginRight: 6 }} />
              Show archived items
            </label>
          </div>

          {/* ── TASKS ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Tasks</h3>
              <button className="button" onClick={() => { setShowCreateTask((v) => !v); setEditingTaskId(null); }}>
                {showCreateTask ? "Cancel" : "+ Add Task"}
              </button>
            </div>

            {showCreateTask && (
              <div className="inline-create-panel" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>New Task</div>
                <div className="form-row">
                  <select className="select" value={newTask.category_id} onChange={(e) => setNewTask({ ...newTask, category_id: e.target.value })}>
                    <option value="">Category *</option>
                    {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="select" value={newTask.account_id} onChange={(e) => setNewTask({ ...newTask, account_id: e.target.value })}>
                    <option value="">Account *</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newTask.owner_id} onChange={(e) => setNewTask({ ...newTask, owner_id: e.target.value })}>
                    <option value="">Owner *</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <input className="input" type="date" value={newTask.target_date} onChange={(e) => setNewTask({ ...newTask, target_date: e.target.value })} />
                  <input className="input" placeholder="SLA days" value={newTask.sla_days} onChange={(e) => setNewTask({ ...newTask, sla_days: e.target.value })} />
                  <select className="select" value={newTask.rag_status} onChange={(e) => setNewTask({ ...newTask, rag_status: e.target.value })}>
                    <option value="Green">Green</option><option value="Amber">Amber</option><option value="Red">Red</option>
                  </select>
                </div>
                <textarea className="input" rows={2} placeholder="Task details *" value={newTask.item_details}
                  onChange={(e) => setNewTask({ ...newTask, item_details: e.target.value })}
                  style={{ resize: "vertical", marginBottom: 10 }} />
                <div className="inline-actions">
                  <label style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={newTask.publish_flag} onChange={(e) => setNewTask({ ...newTask, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                    Publish
                  </label>
                  <button className="button" onClick={createTask}>Create Task</button>
                  <button className="button secondary" onClick={() => setShowCreateTask(false)}>Cancel</button>
                </div>
              </div>
            )}

            {tasks.length === 0 && !showCreateTask && (
              <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>No tasks yet.</div>
            )}

            {tasks.map((t) => (
              <div key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                {editingTaskId === t.id ? (
                  <div style={{ padding: "14px 0" }}>
                    <div className="form-row">
                      <select className="select" value={taskEditForm.category_id} onChange={(e) => setTaskEditForm({ ...taskEditForm, category_id: e.target.value })}>
                        <option value="">Category</option>
                        {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select className="select" value={taskEditForm.account_id} onChange={(e) => setTaskEditForm({ ...taskEditForm, account_id: e.target.value })}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                      <select className="select" value={taskEditForm.owner_id} onChange={(e) => setTaskEditForm({ ...taskEditForm, owner_id: e.target.value })}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div className="form-row">
                      <input className="input" type="date" value={taskEditForm.target_date} onChange={(e) => setTaskEditForm({ ...taskEditForm, target_date: e.target.value })} />
                      <input className="input" placeholder="SLA days" value={taskEditForm.sla_days ?? ""} onChange={(e) => setTaskEditForm({ ...taskEditForm, sla_days: e.target.value })} />
                      <select className="select" value={taskEditForm.rag_status} onChange={(e) => setTaskEditForm({ ...taskEditForm, rag_status: e.target.value })}>
                        <option value="Green">Green</option><option value="Amber">Amber</option><option value="Red">Red</option>
                      </select>
                      <select className="select" value={taskEditForm.status} onChange={(e) => setTaskEditForm({ ...taskEditForm, status: e.target.value })}>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed Pending Approval">Closed Pending Approval</option>
                        <option value="Closed Accepted">Closed Accepted</option>
                      </select>
                    </div>
                    <textarea className="input" rows={3} value={taskEditForm.item_details}
                      onChange={(e) => setTaskEditForm({ ...taskEditForm, item_details: e.target.value })}
                      style={{ resize: "vertical", marginBottom: 10 }} />
                    <div className="inline-actions">
                      <label style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={taskEditForm.publish_flag} onChange={(e) => setTaskEditForm({ ...taskEditForm, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                        Publish
                      </label>
                      <button className="button" onClick={() => saveTask(t.id)}>Save</button>
                      <button className="button secondary" onClick={() => requestTaskClose(t.id)}>Request Close</button>
                      <button className="button secondary" onClick={() => approveTask(t.id)}>Approve</button>
                      <button className="button secondary" onClick={() => setEditingTaskId(null)}>Cancel</button>
                      <button className="button danger" onClick={() => deleteTask(t.id)}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: RAG_DOT[t.rag_status] ?? "#ccc", flexShrink: 0, marginTop: 4 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{t.item_details}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {catName(t.category_id)} &nbsp;·&nbsp; {acctName(t.account_id)} &nbsp;·&nbsp; {ownerName(t.owner_id)}
                          {t.target_date && <> &nbsp;·&nbsp; Due {fmt(t.target_date)}</>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span>
                      <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => openEditTask(t)}>Edit</button>
                      <button className="button danger" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => deleteTask(t.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── RISKS ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Risks</h3>
              <button className="button" onClick={() => { setShowCreateRisk((v) => !v); setEditingRiskId(null); }}>
                {showCreateRisk ? "Cancel" : "+ Add Risk"}
              </button>
            </div>

            {showCreateRisk && (
              <div className="inline-create-panel" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>New Risk</div>
                <div className="form-row">
                  <select className="select" value={newRisk.account_id} onChange={(e) => setNewRisk({ ...newRisk, account_id: e.target.value })}>
                    <option value="">Account *</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newRisk.risk_owner} onChange={(e) => setNewRisk({ ...newRisk, risk_owner: e.target.value })}>
                    <option value="">Owner *</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select className="select" value={newRisk.impact_level} onChange={(e) => setNewRisk({ ...newRisk, impact_level: e.target.value })}>
                    <option value="Low">Low</option><option value="Medium">Medium</option>
                    <option value="High">High</option><option value="Critical">Critical</option>
                  </select>
                  <select className="select" value={newRisk.probability} onChange={(e) => setNewRisk({ ...newRisk, probability: e.target.value })}>
                    <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                  </select>
                </div>
                <input className="input" placeholder="Risk title *" value={newRisk.risk_title} onChange={(e) => setNewRisk({ ...newRisk, risk_title: e.target.value })} style={{ marginBottom: 8 }} />
                <textarea className="input" rows={2} placeholder="Description" value={newRisk.risk_description}
                  onChange={(e) => setNewRisk({ ...newRisk, risk_description: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                <textarea className="input" rows={2} placeholder="Mitigation plan" value={newRisk.mitigation_plan}
                  onChange={(e) => setNewRisk({ ...newRisk, mitigation_plan: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                <div className="form-row">
                  <input className="input" type="date" value={newRisk.target_mitigation_date} onChange={(e) => setNewRisk({ ...newRisk, target_mitigation_date: e.target.value })} />
                </div>
                <div className="inline-actions">
                  <label style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={newRisk.publish_flag} onChange={(e) => setNewRisk({ ...newRisk, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                    Publish
                  </label>
                  <button className="button" onClick={createRisk}>Create Risk</button>
                  <button className="button secondary" onClick={() => setShowCreateRisk(false)}>Cancel</button>
                </div>
              </div>
            )}

            {risks.length === 0 && !showCreateRisk && (
              <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>No risks yet.</div>
            )}

            {risks.map((r) => (
              <div key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                {editingRiskId === r.id ? (
                  <div style={{ padding: "14px 0" }}>
                    <input className="input" placeholder="Risk title" value={riskEditForm.risk_title}
                      onChange={(e) => setRiskEditForm({ ...riskEditForm, risk_title: e.target.value })} style={{ marginBottom: 8 }} />
                    <textarea className="input" rows={2} placeholder="Description" value={riskEditForm.risk_description}
                      onChange={(e) => setRiskEditForm({ ...riskEditForm, risk_description: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                    <textarea className="input" rows={2} placeholder="Mitigation plan" value={riskEditForm.mitigation_plan}
                      onChange={(e) => setRiskEditForm({ ...riskEditForm, mitigation_plan: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                    <div className="form-row">
                      <select className="select" value={riskEditForm.account_id} onChange={(e) => setRiskEditForm({ ...riskEditForm, account_id: e.target.value })}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                      <select className="select" value={riskEditForm.risk_owner} onChange={(e) => setRiskEditForm({ ...riskEditForm, risk_owner: e.target.value })}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <select className="select" value={riskEditForm.impact_level} onChange={(e) => setRiskEditForm({ ...riskEditForm, impact_level: e.target.value })}>
                        <option value="Low">Low</option><option value="Medium">Medium</option>
                        <option value="High">High</option><option value="Critical">Critical</option>
                      </select>
                      <select className="select" value={riskEditForm.probability} onChange={(e) => setRiskEditForm({ ...riskEditForm, probability: e.target.value })}>
                        <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                      </select>
                      <select className="select" value={riskEditForm.status} onChange={(e) => setRiskEditForm({ ...riskEditForm, status: e.target.value })}>
                        <option value="Open">Open</option><option value="Mitigated">Mitigated</option><option value="Closed">Closed</option>
                      </select>
                      <input className="input" type="date" value={riskEditForm.target_mitigation_date}
                        onChange={(e) => setRiskEditForm({ ...riskEditForm, target_mitigation_date: e.target.value })} />
                    </div>
                    <div className="inline-actions" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={riskEditForm.publish_flag} onChange={(e) => setRiskEditForm({ ...riskEditForm, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                        Publish
                      </label>
                      <button className="button" onClick={() => saveRisk(r.id)}>Save</button>
                      <button className="button secondary" onClick={() => setEditingRiskId(null)}>Cancel</button>
                      <button className="button danger" onClick={() => deleteRisk(r.id)}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{r.risk_title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {acctName(r.account_id)} &nbsp;·&nbsp; {ownerName(r.risk_owner)}
                        {r.target_mitigation_date && <> &nbsp;·&nbsp; Target {fmt(r.target_mitigation_date)}</>}
                      </div>
                      {r.risk_description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.risk_description}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className={`tag ${IMPACT_CLASS[r.impact_level] ?? "amber"}`}>{r.impact_level}</span>
                      <span className={`tag ${r.status === "Closed" || r.status === "Mitigated" ? "green" : "amber"}`}>{r.status}</span>
                      <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => openEditRisk(r)}>Edit</button>
                      <button className="button danger" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => deleteRisk(r.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── DECISIONS ── */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Decisions</h3>
              <button className="button" onClick={() => { setShowCreateDecision((v) => !v); setEditingDecisionId(null); }}>
                {showCreateDecision ? "Cancel" : "+ Add Decision"}
              </button>
            </div>

            {showCreateDecision && (
              <div className="inline-create-panel" style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>New Decision</div>
                <div className="form-row">
                  <select className="select" value={newDecision.account_id} onChange={(e) => setNewDecision({ ...newDecision, account_id: e.target.value })}>
                    <option value="">Account *</option>
                    {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                  </select>
                  <select className="select" value={newDecision.decision_owner} onChange={(e) => setNewDecision({ ...newDecision, decision_owner: e.target.value })}>
                    <option value="">Owner *</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input className="input" type="date" value={newDecision.decision_deadline} onChange={(e) => setNewDecision({ ...newDecision, decision_deadline: e.target.value })} />
                  <input className="input" placeholder="Impact area" value={newDecision.impact_area} onChange={(e) => setNewDecision({ ...newDecision, impact_area: e.target.value })} />
                </div>
                <input className="input" placeholder="Decision title *" value={newDecision.decision_title}
                  onChange={(e) => setNewDecision({ ...newDecision, decision_title: e.target.value })} style={{ marginBottom: 8 }} />
                <textarea className="input" rows={2} placeholder="Context / background" value={newDecision.decision_context}
                  onChange={(e) => setNewDecision({ ...newDecision, decision_context: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                <div className="inline-actions">
                  <label style={{ fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={newDecision.publish_flag} onChange={(e) => setNewDecision({ ...newDecision, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                    Publish
                  </label>
                  <button className="button" onClick={createDecision}>Create Decision</button>
                  <button className="button secondary" onClick={() => setShowCreateDecision(false)}>Cancel</button>
                </div>
              </div>
            )}

            {decisions.length === 0 && !showCreateDecision && (
              <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>No decisions yet.</div>
            )}

            {decisions.map((d) => (
              <div key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                {editingDecisionId === d.id ? (
                  <div style={{ padding: "14px 0" }}>
                    <input className="input" placeholder="Decision title" value={decisionEditForm.decision_title}
                      onChange={(e) => setDecisionEditForm({ ...decisionEditForm, decision_title: e.target.value })} style={{ marginBottom: 8 }} />
                    <textarea className="input" rows={2} placeholder="Context / background" value={decisionEditForm.decision_context}
                      onChange={(e) => setDecisionEditForm({ ...decisionEditForm, decision_context: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                    <div className="form-row">
                      <select className="select" value={decisionEditForm.account_id} onChange={(e) => setDecisionEditForm({ ...decisionEditForm, account_id: e.target.value })}>
                        <option value="">Account</option>
                        {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                      </select>
                      <select className="select" value={decisionEditForm.decision_owner} onChange={(e) => setDecisionEditForm({ ...decisionEditForm, decision_owner: e.target.value })}>
                        <option value="">Owner</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <input className="input" type="date" value={decisionEditForm.decision_deadline}
                        onChange={(e) => setDecisionEditForm({ ...decisionEditForm, decision_deadline: e.target.value })} />
                      <input className="input" placeholder="Impact area" value={decisionEditForm.impact_area}
                        onChange={(e) => setDecisionEditForm({ ...decisionEditForm, impact_area: e.target.value })} />
                      <select className="select" value={decisionEditForm.status} onChange={(e) => setDecisionEditForm({ ...decisionEditForm, status: e.target.value })}>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Deferred">Deferred</option>
                      </select>
                    </div>
                    <div className="inline-actions" style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={decisionEditForm.publish_flag} onChange={(e) => setDecisionEditForm({ ...decisionEditForm, publish_flag: e.target.checked })} style={{ marginRight: 6 }} />
                        Publish
                      </label>
                      <button className="button" onClick={() => saveDecision(d.id)}>Save</button>
                      <button className="button secondary" onClick={() => setEditingDecisionId(null)}>Cancel</button>
                      <button className="button danger" onClick={() => deleteDecision(d.id)}>Delete</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "12px 0", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{d.decision_title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {acctName(d.account_id)} &nbsp;·&nbsp; {ownerName(d.decision_owner)}
                        {d.decision_deadline && <> &nbsp;·&nbsp; Deadline {fmt(d.decision_deadline)}</>}
                        {d.impact_area && <> &nbsp;·&nbsp; {d.impact_area}</>}
                      </div>
                      {d.decision_context && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{d.decision_context}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className={`tag ${DECISION_STATUS_CLASS[d.status] ?? "amber"}`}>{d.status}</span>
                      <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => openEditDecision(d)}>Edit</button>
                      <button className="button danger" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => deleteDecision(d.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
