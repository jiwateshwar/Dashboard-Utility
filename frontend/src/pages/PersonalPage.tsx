import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ComboBox } from "../components/ComboBox";

type Tab = "overview" | "escalations" | "approvals" | "manage";

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

export default function PersonalPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState<any>({});
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api("/personal"),
      api("/accounts"),
      api("/users"),
    ]).then(([personal, accts, usrs]) => {
      setData(personal);
      setAccounts(accts);
      setUsers(usrs);
    });
  }, []);

  const accountComboOptions = useMemo(
    () => accounts.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, label: a.account_name })),
    [accounts]
  );
  const userComboOptions = useMemo(
    () => users.map((u) => ({ id: u.id, label: u.name })),
    [users]
  );

  function acctName(id?: string) {
    return accounts.find((a) => a.id === id)?.account_name ?? "—";
  }

  function openEditTask(t: any) {
    setEditingTaskId(t.id);
    setTaskError(null);
    setTaskEditForm({
      title: t.title ?? "",
      item_details: t.item_details,
      account_id: t.account_id,
      owner_ids: Array.isArray(t.owner_ids) ? t.owner_ids : (t.owner_id ? [t.owner_id] : []),
      target_date: t.target_date?.slice(0, 10) || "",
      sla_days: t.sla_days ?? "",
      status: t.status,
      publish_flag: t.publish_flag,
    });
  }

  async function refreshPersonal() {
    const personal = await api("/personal");
    setData(personal);
  }

  async function saveTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(taskEditForm) });
      setEditingTaskId(null);
      await refreshPersonal();
    } catch (err: any) { setTaskError(err.message); }
  }

  async function requestTaskClose(taskId: string) {
    try {
      await api(`/tasks/${taskId}/close-request`, { method: "POST" });
      await refreshPersonal();
    } catch (err: any) { setTaskError(err.message); }
  }

  async function approveTask(taskId: string) {
    try {
      await api(`/tasks/${taskId}/approve`, { method: "POST" });
      await refreshPersonal();
    } catch (err: any) { setTaskError(err.message); }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Permanently delete this task?")) return;
    try {
      await api(`/tasks/${taskId}`, { method: "DELETE" });
      await refreshPersonal();
    } catch (err: any) { setTaskError(err.message); }
  }

  if (!data) return <div className="dashboard-shell"><div>Loading...</div></div>;

  const openTasks = data.tasks.filter((t: any) => t.status !== "Closed Accepted");
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
        <h1>My Work</h1>
      </div>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ marginTop: 12 }}>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#1d63ed" }}>{openTasks.length}</div>
            <div className="kpi-label">Open Tasks</div>
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
            <div className="kpi-value" style={{ color: "#6366f1" }}>{data.pendingApprovals.length}</div>
            <div className="kpi-label">Pending Approvals</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: "#f5a623" }}>{data.escalations.length}</div>
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
          Escalations<CountBadge count={data.escalations.length} />
        </button>
        <button className={`tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
          Pending Approvals<CountBadge count={data.pendingApprovals.length} />
        </button>
        <button className={`tab${tab === "manage" ? " active" : ""}`} onClick={() => setTab("manage")}>
          Manage
        </button>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <>
          {/* My Tasks */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Tasks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {data.tasks.length} {data.tasks.length === 1 ? "item" : "items"}
              </span>
            </div>
            {data.tasks.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No tasks assigned</div>
            ) : (
              data.tasks.map((t: any) => (
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

          {/* My Risks */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Risks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {data.risks.length} {data.risks.length === 1 ? "item" : "items"}
              </span>
            </div>
            {data.risks.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No risks assigned</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Risk</th><th>Impact</th><th>Probability</th><th>Mitigation Target</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.risks.map((r: any) => (
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

          {/* My Decisions */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Decisions</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
                {data.decisions.length} {data.decisions.length === 1 ? "item" : "items"}
              </span>
            </div>
            {data.decisions.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No decisions assigned</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Decision</th><th>Deadline</th><th>Impact Area</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.decisions.map((d: any) => (
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
            <h3 style={{ margin: 0 }}>My Escalations</h3>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
              {data.escalations.length} {data.escalations.length === 1 ? "item" : "items"}
            </span>
          </div>
          {data.escalations.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No escalations</div>
          ) : (
            data.escalations.map((e: any) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--border)", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
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
              {data.pendingApprovals.length} {data.pendingApprovals.length === 1 ? "item" : "items"}
            </span>
          </div>
          {data.pendingApprovals.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No pending approvals</div>
          ) : (
            data.pendingApprovals.map((t: any) => (
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

      {/* ── MANAGE ── */}
      {tab === "manage" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>My Tasks</h3>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>
              {data.tasks.length} {data.tasks.length === 1 ? "item" : "items"}
            </span>
          </div>
          {taskError && <div style={{ color: "red", marginBottom: 8, fontSize: 13 }}>{taskError}</div>}
          {data.tasks.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No tasks assigned</div>
          ) : (
            data.tasks.map((t: any) => (
              <div key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                {editingTaskId === t.id ? (
                  <div style={{ padding: "14px 0" }}>
                    <div className="form-row">
                      <ComboBox
                        options={accountComboOptions}
                        selectedIds={taskEditForm.account_id ? [taskEditForm.account_id] : []}
                        onChange={(ids) => setTaskEditForm({ ...taskEditForm, account_id: ids[0] ?? "" })}
                        placeholder="Account"
                      />
                      <ComboBox
                        options={userComboOptions}
                        selectedIds={taskEditForm.owner_ids ?? []}
                        onChange={(ids) => setTaskEditForm({ ...taskEditForm, owner_ids: ids })}
                        placeholder="Owner(s)"
                        multi
                      />
                    </div>
                    <div className="form-row">
                      <input className="input" type="date" value={taskEditForm.target_date} onChange={(e) => setTaskEditForm({ ...taskEditForm, target_date: e.target.value })} />
                      <input className="input" placeholder="SLA days" value={taskEditForm.sla_days ?? ""} onChange={(e) => setTaskEditForm({ ...taskEditForm, sla_days: e.target.value })} />
                      <select className="select" value={taskEditForm.status} onChange={(e) => setTaskEditForm({ ...taskEditForm, status: e.target.value })}>
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Closed Pending Approval">Closed Pending Approval</option>
                        <option value="Closed Accepted">Closed Accepted</option>
                      </select>
                    </div>
                    <input className="input" placeholder="Title" value={taskEditForm.title ?? ""}
                      onChange={(e) => setTaskEditForm({ ...taskEditForm, title: e.target.value })}
                      style={{ marginBottom: 8, fontWeight: 600 }} />
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {t.title && <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{t.title}</div>}
                      <div style={{ fontSize: t.title ? 13 : 14, marginBottom: 3 }}>{t.item_details}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {acctName(t.account_id)}
                        {t.target_date && <> · Due {fmt(t.target_date)}</>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <AgingChip targetDate={t.target_date} status={t.status} />
                      <span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span>
                      <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => openEditTask(t)}>Edit</button>
                      <button className="button danger" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => deleteTask(t.id)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
