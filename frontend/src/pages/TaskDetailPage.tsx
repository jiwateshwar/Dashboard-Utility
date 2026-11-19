import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ComboBox } from "../components/ComboBox";
import { HashtagInput } from "../components/HashtagInput";
import { HashtagChips } from "../components/HashtagChips";
import { FocusWeekSelect } from "../components/FocusWeekSelect";
import { formatWeekLabel } from "../lib/weeks";
import { useBack } from "../lib/navMemory";

// One task in full: its details, everything that has happened to it in time
// order, and a box to post a progress update. Reached by clicking a task's
// subject anywhere in PRISM, or from the link in task emails.

const STATUS_CLASS: Record<string, string> = { Open: "amber", "In Progress": "green", Parked: "grey", "Closed Pending Approval": "amber", "Closed Accepted": "green", Dropped: "grey" };
const NOT_OVERDUE = ["Closed Accepted", "Closed Pending Approval", "Dropped", "Parked"];

type Entry = {
  id: string;
  at: string;
  kind: "created" | "change" | "update" | "closure_requested" | "closure_approved" | "closure_rejected" | "closure_auto" | "escalated" | "update_requested";
  actor: { id: string | null; name: string | null } | null;
  text?: string;
  changes?: { field: string; label: string; from: any; to: any }[];
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function relative(d: string) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}
function daysPast(date?: string | null) {
  if (!date) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - new Date(`${date.slice(0, 10)}T00:00:00`).getTime()) / 86400000);
}
function initials(name?: string | null) {
  if (!name) return "⚙";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function showValue(field: string, v: any): string {
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return "none";
  if (field === "target_date") return fmtDate(v);
  if (field === "focus_week_start") return formatWeekLabel(String(v).slice(0, 10));
  if (field === "publish_flag") return v ? "Yes" : "No";
  if (field === "tags") return v.map((t: string) => `#${t}`).join(" ");
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function ChangeLine({ c }: { c: NonNullable<Entry["changes"]>[number] }) {
  if (c.field === "owner_ids") {
    const from: string[] = c.from ?? [];
    const to: string[] = c.to ?? [];
    const added = to.filter((x) => !from.includes(x));
    const removed = from.filter((x) => !to.includes(x));
    return (
      <div className="timeline-change">
        <span className="timeline-field">Owners</span>
        {added.length > 0 && <span> added <b>{added.join(", ")}</b></span>}
        {added.length > 0 && removed.length > 0 && <span>;</span>}
        {removed.length > 0 && <span> removed <b>{removed.join(", ")}</b></span>}
      </div>
    );
  }
  if (c.field === "item_details" || (c.field === "title" && String(c.to ?? "").length > 80)) {
    return (
      <div className="timeline-change">
        <span className="timeline-field">{c.label}</span> changed
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Show before and after</summary>
          <div className="timeline-diff">
            <div><div className="timeline-diff-label">Before</div><div className="timeline-diff-old">{showValue(c.field, c.from)}</div></div>
            <div><div className="timeline-diff-label">After</div><div>{showValue(c.field, c.to)}</div></div>
          </div>
        </details>
      </div>
    );
  }
  return (
    <div className="timeline-change">
      <span className="timeline-field">{c.label}</span>{" "}
      <span className="timeline-old">{showValue(c.field, c.from)}</span> → <b>{showValue(c.field, c.to)}</b>
    </div>
  );
}

function EntryBody({ e }: { e: Entry }) {
  const who = e.actor?.name ?? "PRISM";
  switch (e.kind) {
    case "created":
      return <div><b>{who}</b> created this task</div>;
    case "update":
      return (
        <>
          <div><b>{who}</b> posted an update</div>
          <div className="timeline-update">{e.text}</div>
        </>
      );
    case "change":
      return (
        <>
          <div><b>{who}</b> made {e.changes!.length === 1 ? "a change" : `${e.changes!.length} changes`}</div>
          <div style={{ marginTop: 4 }}>{e.changes!.map((c) => <ChangeLine key={c.field} c={c} />)}</div>
        </>
      );
    case "closure_requested":
      return <div>{e.actor ? <><b>{who}</b> requested closure</> : <>Closure requested</>} — waiting for approval</div>;
    case "closure_approved":
      return <div><b>{who}</b> approved the closure</div>;
    case "closure_rejected":
      return <><div><b>{who}</b> rejected the closure; the task is Open again</div>{e.text && <div className="timeline-update">{e.text}</div>}</>;
    case "closure_auto":
      return <div>Closed automatically{e.text ? ` — ${e.text.toLowerCase()}` : ""}</div>;
    case "escalated":
      return <div>Escalated: {e.text}</div>;
    case "update_requested":
      return <div><b>{who}</b> {e.text?.replace(/^R/, "r").replace(/^S/, "s")}</div>;
  }
}

const KIND_ICON: Record<Entry["kind"], string> = {
  created: "✚", change: "✎", update: "", closure_requested: "⏳", closure_approved: "✓", closure_rejected: "↺",
  closure_auto: "✓", escalated: "⚑", update_requested: "✉"
};

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState<any>(null);
  const [timeline, setTimeline] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "updates" | "changes">("all");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [lookups, setLookups] = useState<{ accounts: any[]; users: any[]; categories: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const back = useBack(task ? `/dashboards/${task.dashboard_id}` : "/");

  async function load() {
    try {
      const [t, tl] = await Promise.all([api(`/tasks/${id}`), api(`/tasks/${id}/timeline`)]);
      setTask(t); setTimeline(tl); setLoadError(null);
    } catch (e: any) {
      setLoadError(e instanceof ApiError && e.status === 403 ? "You don't have access to this task." : e instanceof ApiError && e.status === 404 ? "This task doesn't exist or was deleted." : e.message || "Couldn't load this task.");
    }
  }
  useEffect(() => { setTask(null); setTimeline(null); setEditing(false); void load(); }, [id]);

  useEffect(() => {
    if (task) document.title = `${task.label} · PRISM`;
    return () => { document.title = "PRISM"; };
  }, [task?.label]);

  const shown = useMemo(() => (timeline ?? []).filter((e) =>
    filter === "all" ? true : filter === "updates" ? e.kind === "update" : e.kind !== "update"), [timeline, filter]);

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true); setPostError(null);
    try {
      await api(`/tasks/${id}/updates`, { method: "POST", body: JSON.stringify({ body }) });
      setDraft("");
      await load();
    } catch (e: any) {
      setPostError(e.message || "Couldn't post the update");
    } finally {
      setPosting(false);
    }
  }

  async function openEdit() {
    setActionError(null);
    setForm({
      title: task.title ?? "", item_details: task.item_details ?? "", account_id: task.account_id,
      category_id: task.category_id, owner_ids: task.owners.map((o: any) => o.id),
      target_date: task.target_date ?? "", sla_days: task.sla_days ?? "", status: task.status,
      publish_flag: task.publish_flag, tags: task.tags ?? [], focus_week_start: task.focus_week_start ?? ""
    });
    setEditing(true);
    if (!lookups) {
      const [accounts, users, categories] = await Promise.all([
        api("/accounts"), api("/users"), api(`/categories?dashboard_id=${task.dashboard_id}`)
      ]);
      setLookups({ accounts, users, categories });
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setActionError(null);
    try { await fn(); setEditing(false); setRejecting(false); await load(); }
    catch (e: any) { setActionError(e.message || "Failed"); }
    finally { setBusy(false); }
  }

  if (loadError) {
    return (
      <div className="dashboard-shell">
        <button className="button secondary" onClick={back} style={{ marginBottom: 16 }}>← Back</button>
        <div className="card" style={{ padding: 24 }}>{loadError}</div>
      </div>
    );
  }
  if (!task) return <div className="dashboard-shell"><div>Loading…</div></div>;

  const overdueBy = NOT_OVERDUE.includes(task.status) ? 0 : daysPast(task.target_date);
  const set = (patch: any) => setForm({ ...form, ...patch });
  const canRequestClose = task.is_owner && !["Closed Pending Approval", "Closed Accepted", "Dropped"].includes(task.status);
  const canDecide = task.status === "Closed Pending Approval" && (task.is_creator || task.is_admin);
  const updatesCount = (timeline ?? []).filter((e) => e.kind === "update").length;

  return (
    <div className="dashboard-shell task-detail">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <button className="button secondary" onClick={back}>← Back</button>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          <Link to={`/dashboards/${task.dashboard_id}`}>{task.dashboard_name}</Link> › Task
        </span>
      </div>

      <div className="dashboard-header">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className={`tag ${STATUS_CLASS[task.status] ?? "amber"}`}>{task.status}</span>
          {overdueBy > 0 && <span className="tag red">{overdueBy}d overdue</span>}
          {task.is_archived && <span className="tag grey">Archived</span>}
        </div>
        <h1 style={{ margin: 0, overflowWrap: "anywhere" }}>{task.label}</h1>
        <div className="dashboard-subtitle" style={{ marginTop: 6 }}>
          Created by {task.created_by_name ?? "—"} on {fmtDate(task.created_at)} · last changed {relative(task.updated_at)}
        </div>
      </div>

      <div className="task-detail-grid">
        {/* ── Details ─────────────────────────────────────── */}
        <div className="card task-detail-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Details</h3>
            {task.can_edit && !editing && <button className="button secondary" style={{ height: 30, padding: "0 12px", fontSize: 13 }} onClick={openEdit}>Edit</button>}
          </div>

          {!editing ? (
            <>
              {task.title && <div className="task-detail-text">{task.item_details}</div>}
              <dl className="task-facts">
                <dt>Due date</dt><dd>{fmtDate(task.target_date)}{overdueBy > 0 && <span style={{ color: "var(--danger)", marginLeft: 6 }}>({overdueBy}d overdue)</span>}</dd>
                <dt>Owners</dt><dd>{task.owners.map((o: any) => o.name).join(", ") || "—"}</dd>
                <dt>Created by</dt><dd>{task.created_by_name ?? "—"}</dd>
                <dt>Created</dt><dd>{fmtDateTime(task.created_at)}</dd>
                <dt>Age</dt><dd>{task.aging_days} day{task.aging_days === 1 ? "" : "s"}</dd>
                <dt>Dashboard</dt><dd><Link to={`/dashboards/${task.dashboard_id}`}>{task.dashboard_name}</Link></dd>
                <dt>Category</dt><dd>{task.category_name ?? "—"}</dd>
                <dt>Account</dt><dd>{task.account_name ?? "—"}</dd>
                <dt>Focus week</dt><dd>{task.focus_week_start ? formatWeekLabel(task.focus_week_start) : "—"}</dd>
                {task.sla_days != null && <><dt>SLA</dt><dd>{task.sla_days} days</dd></>}
                <dt>Tags</dt><dd>{task.tags?.length ? <HashtagChips tags={task.tags} /> : "—"}</dd>
                <dt>Published</dt><dd>{task.publish_flag ? "Yes" : "No"}</dd>
                {task.closure_requested_at && <><dt>Closure requested</dt><dd>{fmtDateTime(task.closure_requested_at)}</dd></>}
                {task.closure_approved_at && <><dt>Closed</dt><dd>{fmtDateTime(task.closure_approved_at)}{task.closure_approved_by_name ? ` by ${task.closure_approved_by_name}` : ""}</dd></>}
              </dl>
            </>
          ) : !lookups ? <div style={{ color: "var(--muted)" }}>Loading…</div> : (
            <div>
              <label className="task-form-label">Title</label>
              <input className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} style={{ marginBottom: 8, fontWeight: 600 }} />
              <label className="task-form-label">Details</label>
              <textarea className="input" rows={4} value={form.item_details} onChange={(e) => set({ item_details: e.target.value })} style={{ resize: "vertical", marginBottom: 8 }} />
              <div className="form-row">
                <select className="select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Parked">Parked</option>
                  <option value="Closed Pending Approval">Closed Pending Approval</option>
                  <option value="Closed Accepted" disabled>Closed Accepted (use Approve)</option>
                  <option value="Dropped">Dropped</option>
                </select>
                <input className="input" type="date" value={form.target_date} onChange={(e) => set({ target_date: e.target.value })} />
              </div>
              <div className="form-row">
                <ComboBox options={lookups.users.map((u) => ({ id: u.id, label: u.name }))} selectedIds={form.owner_ids ?? []} onChange={(ids) => set({ owner_ids: ids })} placeholder="Owner(s)" multi />
              </div>
              <div className="form-row">
                <select className="select" value={form.category_id ?? ""} onChange={(e) => set({ category_id: e.target.value })}>
                  {lookups.categories.filter((c) => c.is_active !== false || c.id === form.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ComboBox options={lookups.accounts.filter((a) => a.is_active !== false).map((a) => ({ id: a.id, label: a.account_name }))} selectedIds={form.account_id ? [form.account_id] : []} onChange={(ids) => set({ account_id: ids[0] ?? "" })} placeholder="Account" />
              </div>
              <div className="form-row">
                <FocusWeekSelect value={form.focus_week_start ?? ""} onChange={(v) => set({ focus_week_start: v })} />
                <input className="input" placeholder="SLA days" value={form.sla_days ?? ""} onChange={(e) => set({ sla_days: e.target.value })} />
              </div>
              <div style={{ marginBottom: 10 }}><HashtagInput tags={form.tags ?? []} onChange={(tags) => set({ tags })} /></div>
              <label style={{ fontSize: 13, cursor: "pointer", display: "block", marginBottom: 10 }}>
                <input type="checkbox" checked={!!form.publish_flag} onChange={(e) => set({ publish_flag: e.target.checked })} style={{ marginRight: 6 }} />Publish
              </label>
              <div className="inline-actions">
                <button className="button" disabled={busy} onClick={() => run(() => api(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(form) }))}>Save</button>
                <button className="button secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}

          {!editing && (canRequestClose || canDecide) && (
            <div className="inline-actions" style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {canRequestClose && <button className="button secondary" disabled={busy} onClick={() => run(() => api(`/tasks/${id}/close-request`, { method: "POST" }))}>Request close</button>}
              {canDecide && !rejecting && <>
                <button className="button" disabled={busy} onClick={() => run(() => api(`/tasks/${id}/approve`, { method: "POST" }))}>Approve closure</button>
                <button className="button secondary" disabled={busy} onClick={() => setRejecting(true)}>Reopen…</button>
              </>}
            </div>
          )}
          {rejecting && (
            <div style={{ marginTop: 10 }}>
              <textarea className="input" rows={2} placeholder="Why is it being reopened? (optional, shared with the owners)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} style={{ resize: "vertical", marginBottom: 8 }} />
              <div className="inline-actions">
                <button className="button danger" disabled={busy} onClick={() => run(() => api(`/tasks/${id}/reject-closure`, { method: "POST", body: JSON.stringify({ reason: rejectReason }) }))}>Reopen task</button>
                <button className="button secondary" onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </div>
          )}
          {actionError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{actionError}</div>}
        </div>

        {/* ── Activity ────────────────────────────────────── */}
        <div className="card task-detail-panel">
          <h3 style={{ margin: "0 0 10px 0" }}>Post an update</h3>
          <textarea
            className="input" rows={3} value={draft} maxLength={5000}
            placeholder="What's the latest? Owners and the creator will be notified."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void post(); }}
            style={{ resize: "vertical", marginBottom: 8 }}
          />
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Ctrl+Enter to post</span>
            <button className="button" disabled={posting || !draft.trim()} onClick={post}>{posting ? "Posting…" : "Post update"}</button>
          </div>
          {postError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 6 }}>{postError}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 8px", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Activity</h3>
            <div className="segmented">
              {([["all", "All"], ["updates", `Updates (${updatesCount})`], ["changes", "Changes"]] as const).map(([k, label]) => (
                <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{label}</button>
              ))}
            </div>
          </div>

          {timeline === null ? <div style={{ color: "var(--muted)" }}>Loading…</div> : shown.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>{filter === "updates" ? "No updates posted yet." : "Nothing here yet."}</div>
          ) : (
            <ol className="timeline">
              {shown.map((e) => (
                <li key={e.id} className={`timeline-item kind-${e.kind}`}>
                  <div className="timeline-dot" title={e.actor?.name ?? "PRISM"}>{e.kind === "update" ? initials(e.actor?.name) : KIND_ICON[e.kind]}</div>
                  <div className="timeline-body">
                    <EntryBody e={e} />
                    <div className="timeline-time" title={fmtDateTime(e.at)}>{fmtDateTime(e.at)} · {relative(e.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
