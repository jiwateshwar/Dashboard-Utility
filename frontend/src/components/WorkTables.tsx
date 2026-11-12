import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ComboBox } from "./ComboBox";
import { HashtagInput } from "./HashtagInput";
import { HashtagChips } from "./HashtagChips";
import { FocusWeekSelect } from "./FocusWeekSelect";
import { formatWeekLabel } from "../lib/weeks";

// Read-and-edit tables for tasks, risks and decisions spanning several
// dashboards (Personal and Team views). Same pattern as the dashboard page:
// one table per type, an Edit button per row that opens the form under it.
// The server enforces who may change what; errors are shown inline.

const TASK_STATUS_CLASS: Record<string, string> = { Open: "amber", "In Progress": "green", "Closed Pending Approval": "amber", "Closed Accepted": "green", Dropped: "grey" };
const IMPACT_CLASS: Record<string, string> = { Low: "green", Medium: "amber", High: "red", Critical: "red" };
const DECISION_STATUS_CLASS: Record<string, string> = { Pending: "amber", Approved: "green", Rejected: "red", Deferred: "amber" };
const d10 = (s?: string) => (s ? s.slice(0, 10) : "—");

function daysPast(date?: string) {
  if (!date) return -999;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - new Date(date.slice(0, 10)).getTime()) / 86400000);
}
function OverdueChip({ date, done }: { date?: string; done?: boolean }) {
  const days = daysPast(date);
  if (done || days <= 0) return null;
  const color = days <= 3 ? "#f5a623" : days <= 7 ? "#fb8c00" : days <= 14 ? "#ef6a62" : "#c62828";
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: `${color}22`, color, whiteSpace: "nowrap" }}>+{days}d overdue</span>;
}
const smallBtn = { height: 28, padding: "0 10px", fontSize: 12 } as const;

type Common = { accounts: any[]; users: any[]; me: any; onChanged: () => void | Promise<unknown> };

function useEditor<T>(onChanged: Common["onChanged"]) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<T>({} as T);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, close = true) {
    setBusy(true); setError(null);
    try { await fn(); if (close) setEditingId(null); await onChanged(); }
    catch (e: any) { setError(e.message || "Failed"); }
    finally { setBusy(false); }
  }
  return { editingId, setEditingId, form, setForm, error, setError, busy, run };
}

function DashCell({ row }: { row: any }) {
  return row.dashboard_id ? <Link to={`/dashboards/${row.dashboard_id}`}>{row.dashboard_name ?? "Open"}</Link> : <>—</>;
}

// ── Tasks ────────────────────────────────────────────────────────

export function EditableTaskTable({ tasks, accounts, users, me, onChanged, showOwners = true }: Common & { tasks: any[]; showOwners?: boolean }) {
  const ed = useEditor<any>(onChanged);
  const accountOptions = useMemo(() => accounts.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, label: a.account_name })), [accounts]);
  const userOptions = useMemo(() => users.map((u) => ({ id: u.id, label: u.name })), [users]);
  const acct = (id?: string) => accounts.find((a) => a.id === id)?.account_name ?? "—";
  const isAdmin = me?.role === "Admin" || me?.role === "SuperAdmin";
  const canApprove = (t: any) => isAdmin || t.created_by === me?.id;
  const cols = showOwners ? 9 : 8;

  function open(t: any) {
    ed.setError(null);
    ed.setEditingId(t.id);
    ed.setForm({
      title: t.title ?? "", item_details: t.item_details, account_id: t.account_id,
      owner_ids: Array.isArray(t.owner_ids) ? t.owner_ids : t.owner_id ? [t.owner_id] : [],
      target_date: t.target_date?.slice(0, 10) || "", sla_days: t.sla_days ?? "", status: t.status,
      publish_flag: t.publish_flag, tags: Array.isArray(t.tags) ? t.tags : [], focus_week_start: t.focus_week_start?.slice(0, 10) || ""
    });
  }
  const f = ed.form, set = (patch: any) => ed.setForm({ ...f, ...patch });

  return (
    <div style={{ overflowX: "auto" }}>
      {tasks.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No tasks match the current filters</div> : (
        <table className="table">
          <thead>
            <tr><th>Task</th><th>Dashboard</th><th>Account</th>{showOwners && <th>Owner(s)</th>}<th>Due</th><th>Focus Week</th><th>Hashtags</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const editing = ed.editingId === t.id;
              return (
                <Fragment key={t.id}>
                  <tr style={editing ? { background: "rgba(29,99,237,0.06)" } : undefined}>
                    <td>{t.title && <div style={{ fontWeight: 700 }}>{t.title}</div>}<div>{t.item_details}</div></td>
                    <td><DashCell row={t} /></td>
                    <td>{acct(t.account_id)}</td>
                    {showOwners && <td>{Array.isArray(t.owner_names) ? t.owner_names.filter(Boolean).join(", ") : "—"}</td>}
                    <td><div>{d10(t.target_date)}</div><OverdueChip date={t.target_date} done={["Closed Accepted", "Closed Pending Approval", "Dropped"].includes(t.status)} /></td>
                    <td style={{ whiteSpace: "nowrap" }}>{t.focus_week_start ? formatWeekLabel(t.focus_week_start.slice(0, 10)) : "—"}</td>
                    <td><HashtagChips tags={t.tags} /></td>
                    <td><span className={`tag ${TASK_STATUS_CLASS[t.status] ?? "amber"}`}>{t.status}</span></td>
                    <td><button className="button secondary" style={smallBtn} onClick={() => (editing ? ed.setEditingId(null) : open(t))}>{editing ? "Close" : "Edit"}</button></td>
                  </tr>
                  {editing && (
                    <tr><td colSpan={cols} style={{ background: "rgba(29,99,237,0.03)" }}>
                      <div style={{ padding: "10px 0" }}>
                        <div className="form-row">
                          <ComboBox options={accountOptions} selectedIds={f.account_id ? [f.account_id] : []} onChange={(ids) => set({ account_id: ids[0] ?? "" })} placeholder="Account" />
                          <ComboBox options={userOptions} selectedIds={f.owner_ids ?? []} onChange={(ids) => set({ owner_ids: ids })} placeholder="Owner(s)" multi />
                        </div>
                        <div className="form-row">
                          <input className="input" type="date" value={f.target_date} onChange={(e) => set({ target_date: e.target.value })} />
                          <input className="input" placeholder="SLA days" value={f.sla_days ?? ""} onChange={(e) => set({ sla_days: e.target.value })} />
                          <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Closed Pending Approval">Closed Pending Approval</option>
                            <option value="Closed Accepted" disabled>Closed Accepted (use Approve)</option>
                            <option value="Dropped">Dropped</option>
                          </select>
                          <FocusWeekSelect value={f.focus_week_start ?? ""} onChange={(v) => set({ focus_week_start: v })} />
                        </div>
                        <input className="input" placeholder="Title" value={f.title ?? ""} onChange={(e) => set({ title: e.target.value })} style={{ marginBottom: 8, fontWeight: 600 }} />
                        <textarea className="input" rows={3} value={f.item_details} onChange={(e) => set({ item_details: e.target.value })} style={{ resize: "vertical", marginBottom: 10 }} />
                        <div style={{ marginBottom: 10 }}><HashtagInput tags={f.tags ?? []} onChange={(tags) => set({ tags })} /></div>
                        {ed.error && <div style={{ color: "#ef6a62", fontSize: 13, marginBottom: 8 }}>{ed.error}</div>}
                        <div className="inline-actions">
                          <label style={{ fontSize: 13, cursor: "pointer" }}>
                            <input type="checkbox" checked={!!f.publish_flag} onChange={(e) => set({ publish_flag: e.target.checked })} style={{ marginRight: 6 }} />Publish
                          </label>
                          <button className="button" disabled={ed.busy} onClick={() => ed.run(() => api(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify(f) }))}>Save</button>
                          {t.status !== "Closed Pending Approval" && t.status !== "Closed Accepted" && (
                            <button className="button secondary" disabled={ed.busy} onClick={() => ed.run(() => api(`/tasks/${t.id}/close-request`, { method: "POST" }))}>Request Close</button>
                          )}
                          {t.status === "Closed Pending Approval" && canApprove(t) && (
                            <button className="button secondary" disabled={ed.busy} onClick={() => ed.run(() => api(`/tasks/${t.id}/approve`, { method: "POST" }))}>Approve closure</button>
                          )}
                          <button className="button secondary" onClick={() => ed.setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Risks ────────────────────────────────────────────────────────

export function EditableRiskTable({ risks, accounts, users, me, onChanged }: Common & { risks: any[] }) {
  const ed = useEditor<any>(onChanged);
  void me;
  function open(r: any) {
    ed.setError(null); ed.setEditingId(r.id);
    ed.setForm({ risk_title: r.risk_title, risk_description: r.risk_description || "", account_id: r.account_id, risk_owner: r.risk_owner, impact_level: r.impact_level, probability: r.probability, mitigation_plan: r.mitigation_plan || "", target_mitigation_date: r.target_mitigation_date?.slice(0, 10) || "", status: r.status, publish_flag: r.publish_flag });
  }
  const f = ed.form, set = (patch: any) => ed.setForm({ ...f, ...patch });
  return (
    <div style={{ overflowX: "auto" }}>
      {risks.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No risks</div> : (
        <table className="table">
          <thead><tr><th>Risk</th><th>Dashboard</th><th>Owner</th><th>Impact</th><th>Probability</th><th>Mitigation Target</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {risks.map((r) => {
              const editing = ed.editingId === r.id;
              const done = r.status === "Closed" || r.status === "Mitigated";
              return (
                <Fragment key={r.id}>
                  <tr style={editing ? { background: "rgba(29,99,237,0.06)" } : undefined}>
                    <td><div style={{ fontWeight: 500 }}>{r.risk_title}</div>{r.risk_description && <div style={{ color: "var(--muted)", fontSize: 12 }}>{r.risk_description}</div>}</td>
                    <td><DashCell row={r} /></td>
                    <td>{r.owner_name ?? "—"}</td>
                    <td><span className={`tag ${IMPACT_CLASS[r.impact_level] ?? "amber"}`}>{r.impact_level}</span></td>
                    <td>{r.probability}</td>
                    <td><div>{d10(r.target_mitigation_date)}</div><OverdueChip date={r.target_mitigation_date} done={done} /></td>
                    <td><span className={`tag ${done ? "green" : "amber"}`}>{r.status}</span></td>
                    <td><button className="button secondary" style={smallBtn} onClick={() => (editing ? ed.setEditingId(null) : open(r))}>{editing ? "Close" : "Edit"}</button></td>
                  </tr>
                  {editing && (
                    <tr><td colSpan={8} style={{ background: "rgba(29,99,237,0.03)" }}>
                      <div style={{ padding: "10px 0" }}>
                        <input className="input" placeholder="Risk title" value={f.risk_title} onChange={(e) => set({ risk_title: e.target.value })} style={{ marginBottom: 8 }} />
                        <textarea className="input" rows={2} placeholder="Description" value={f.risk_description} onChange={(e) => set({ risk_description: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                        <textarea className="input" rows={2} placeholder="Mitigation plan" value={f.mitigation_plan} onChange={(e) => set({ mitigation_plan: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                        <div className="form-row">
                          <select className="select" value={f.account_id} onChange={(e) => set({ account_id: e.target.value })}>
                            <option value="">Account</option>{accounts.filter((a) => a.is_active !== false).map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                          </select>
                          <select className="select" value={f.risk_owner} onChange={(e) => set({ risk_owner: e.target.value })}>
                            <option value="">Owner</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          <select className="select" value={f.impact_level} onChange={(e) => set({ impact_level: e.target.value })}>
                            <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option>
                          </select>
                          <select className="select" value={f.probability} onChange={(e) => set({ probability: e.target.value })}>
                            <option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                          </select>
                          <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
                            <option value="Open">Open</option><option value="Mitigated">Mitigated</option><option value="Closed">Closed</option>
                          </select>
                          <input className="input" type="date" value={f.target_mitigation_date} onChange={(e) => set({ target_mitigation_date: e.target.value })} />
                        </div>
                        {ed.error && <div style={{ color: "#ef6a62", fontSize: 13, margin: "8px 0" }}>{ed.error}</div>}
                        <div className="inline-actions" style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!f.publish_flag} onChange={(e) => set({ publish_flag: e.target.checked })} style={{ marginRight: 6 }} />Publish</label>
                          <button className="button" disabled={ed.busy} onClick={() => ed.run(() => api(`/risks/${r.id}`, { method: "PATCH", body: JSON.stringify(f) }))}>Save</button>
                          <button className="button secondary" onClick={() => ed.setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Decisions ────────────────────────────────────────────────────

export function EditableDecisionTable({ decisions, accounts, users, me, onChanged }: Common & { decisions: any[] }) {
  const ed = useEditor<any>(onChanged);
  void me;
  function open(d: any) {
    ed.setError(null); ed.setEditingId(d.id);
    ed.setForm({ decision_title: d.decision_title, decision_context: d.decision_context || "", account_id: d.account_id, decision_owner: d.decision_owner, decision_deadline: d.decision_deadline?.slice(0, 10) || "", impact_area: d.impact_area || "", status: d.status, publish_flag: d.publish_flag });
  }
  const f = ed.form, set = (patch: any) => ed.setForm({ ...f, ...patch });
  return (
    <div style={{ overflowX: "auto" }}>
      {decisions.length === 0 ? <div style={{ color: "var(--muted)", fontSize: 13 }}>No decisions</div> : (
        <table className="table">
          <thead><tr><th>Decision</th><th>Dashboard</th><th>Owner</th><th>Deadline</th><th>Impact Area</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {decisions.map((d) => {
              const editing = ed.editingId === d.id;
              return (
                <Fragment key={d.id}>
                  <tr style={editing ? { background: "rgba(29,99,237,0.06)" } : undefined}>
                    <td><div style={{ fontWeight: 500 }}>{d.decision_title}</div>{d.decision_context && <div style={{ color: "var(--muted)", fontSize: 12 }}>{d.decision_context}</div>}</td>
                    <td><DashCell row={d} /></td>
                    <td>{d.owner_name ?? "—"}</td>
                    <td><div>{d10(d.decision_deadline)}</div><OverdueChip date={d.decision_deadline} done={d.status !== "Pending"} /></td>
                    <td>{d.impact_area || "—"}</td>
                    <td><span className={`tag ${DECISION_STATUS_CLASS[d.status] ?? "amber"}`}>{d.status}</span></td>
                    <td><button className="button secondary" style={smallBtn} onClick={() => (editing ? ed.setEditingId(null) : open(d))}>{editing ? "Close" : "Edit"}</button></td>
                  </tr>
                  {editing && (
                    <tr><td colSpan={7} style={{ background: "rgba(29,99,237,0.03)" }}>
                      <div style={{ padding: "10px 0" }}>
                        <input className="input" placeholder="Decision title" value={f.decision_title} onChange={(e) => set({ decision_title: e.target.value })} style={{ marginBottom: 8 }} />
                        <textarea className="input" rows={2} placeholder="Context / background" value={f.decision_context} onChange={(e) => set({ decision_context: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
                        <div className="form-row">
                          <select className="select" value={f.account_id} onChange={(e) => set({ account_id: e.target.value })}>
                            <option value="">Account</option>{accounts.filter((a) => a.is_active !== false).map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                          </select>
                          <select className="select" value={f.decision_owner} onChange={(e) => set({ decision_owner: e.target.value })}>
                            <option value="">Owner</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          <input className="input" type="date" value={f.decision_deadline} onChange={(e) => set({ decision_deadline: e.target.value })} />
                          <input className="input" placeholder="Impact area" value={f.impact_area} onChange={(e) => set({ impact_area: e.target.value })} />
                          <select className="select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
                            <option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option><option value="Deferred">Deferred</option>
                          </select>
                        </div>
                        {ed.error && <div style={{ color: "#ef6a62", fontSize: 13, margin: "8px 0" }}>{ed.error}</div>}
                        <div className="inline-actions" style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!f.publish_flag} onChange={(e) => set({ publish_flag: e.target.checked })} style={{ marginRight: 6 }} />Publish</label>
                          <button className="button" disabled={ed.busy} onClick={() => ed.run(() => api(`/decisions/${d.id}`, { method: "PATCH", body: JSON.stringify(f) }))}>Save</button>
                          <button className="button secondary" onClick={() => ed.setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
