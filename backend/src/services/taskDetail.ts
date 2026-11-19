// Everything behind a task's detail page (/tasks/:id): who may see it, its
// full details, a normalized snapshot used for change auditing, the merged
// chronological timeline, and the details table used in task emails.
import { query } from "../db.js";
import { getSubordinateIds } from "./hierarchy.js";
import { getUserRole, isAdminRole, canEditDashboard } from "./permission.js";
import type { Table } from "./emailTemplates.js";

/* ── Visibility ─────────────────────────────────────────────────────────
   Same rules as the dashboard task list and global search: admins, the
   dashboard's owners, the task's creator/owners and their managers always
   see it; anyone with access to the dashboard (or a parent up to two levels
   above, where published items roll up) sees it once it's published; and
   whoever it was escalated to can see it. */
export async function canViewTask(userId: string, taskId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  if (isAdminRole(role)) {
    const { rows } = await query(`SELECT 1 FROM tasks WHERE id = $1`, [taskId]);
    return rows.length > 0;
  }
  const subordinates = await getSubordinateIds(userId);
  const { rows } = await query(
    `WITH RECURSIVE ancestors AS (
       SELECT d.id, d.parent_dashboard_id, 0 AS depth FROM dashboards d
       JOIN tasks t ON t.dashboard_id = d.id WHERE t.id = $1
       UNION ALL
       SELECT p.id, p.parent_dashboard_id, a.depth + 1 FROM dashboards p
       JOIN ancestors a ON p.id = a.parent_dashboard_id WHERE a.depth < 2
     )
     SELECT 1 FROM tasks t
     WHERE t.id = $1 AND (
       t.owner_id = $2 OR t.created_by = $2
       OR t.owner_id = ANY($3) OR t.created_by = ANY($3)
       OR EXISTS (SELECT 1 FROM task_owners o WHERE o.task_id = t.id AND (o.user_id = $2 OR o.user_id = ANY($3)))
       OR EXISTS (SELECT 1 FROM dashboard_owners dow WHERE dow.dashboard_id = t.dashboard_id AND dow.user_id = $2)
       OR EXISTS (SELECT 1 FROM dashboards d WHERE d.id = t.dashboard_id AND (d.primary_owner_id = $2 OR d.secondary_owner_id = $2))
       OR EXISTS (SELECT 1 FROM escalations e WHERE e.entity_type = 'Task' AND e.entity_id = t.id AND e.notified_user_id = $2)
       OR (t.publish_flag = true AND EXISTS (
             SELECT 1 FROM ancestors a
             JOIN dashboard_access da ON da.dashboard_id = a.id AND da.user_id = $2 AND da.can_view = true))
     )
     LIMIT 1`,
    [taskId, userId, subordinates]
  );
  return rows.length > 0;
}

/* ── Details ───────────────────────────────────────────────────────── */
export async function loadTaskDetail(taskId: string) {
  const { rows } = await query(
    `SELECT t.id, t.title, t.item_details, t.status, t.publish_flag, t.is_archived,
            to_char(t.target_date, 'YYYY-MM-DD') AS target_date,
            to_char(t.focus_week_start, 'YYYY-MM-DD') AS focus_week_start,
            t.sla_days, t.created_at, t.updated_at,
            t.closure_requested_at, t.closure_approved_at,
            t.dashboard_id, d.name AS dashboard_name, d.is_active AS dashboard_active,
            t.category_id, c.name AS category_name,
            t.account_id, a.account_name,
            t.created_by, cu.name AS created_by_name,
            t.closure_approved_by, au.name AS closure_approved_by_name,
            date_part('day', now() - t.created_at)::int AS aging_days,
            COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'email', u.email) ORDER BY u.name)
                      FROM task_owners o JOIN users u ON u.id = o.user_id WHERE o.task_id = t.id),
                     json_build_array(json_build_object('id', ou.id, 'name', ou.name, 'email', ou.email))) AS owners,
            COALESCE((SELECT array_agg(tg.tag ORDER BY tg.tag) FROM task_tags tg WHERE tg.task_id = t.id), ARRAY[]::text[]) AS tags
     FROM tasks t
     JOIN dashboards d ON d.id = t.dashboard_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN users cu ON cu.id = t.created_by
     LEFT JOIN users ou ON ou.id = t.owner_id
     LEFT JOIN users au ON au.id = t.closure_approved_by
     WHERE t.id = $1`,
    [taskId]
  );
  return rows[0] ?? null;
}

export async function taskDetailFor(userId: string, taskId: string) {
  const task = await loadTaskDetail(taskId);
  if (!task) return null;
  const role = await getUserRole(userId);
  const ownerIds: string[] = task.owners.map((o: any) => o.id);
  return {
    ...task,
    label: task.title || task.item_details,
    can_edit: await canEditDashboard(userId, task.dashboard_id),
    is_owner: ownerIds.includes(userId),
    is_creator: task.created_by === userId,
    is_admin: isAdminRole(role)
  };
}

/* ── Snapshot for auditing ─────────────────────────────────────────── */
export type TaskSnapshot = {
  title: string | null;
  item_details: string | null;
  status: string | null;
  target_date: string | null;
  category_id: string | null;
  account_id: string | null;
  owner_ids: string[];
  tags: string[];
  publish_flag: boolean | null;
  focus_week_start: string | null;
  sla_days: number | null;
};

export async function taskSnapshot(taskId: string): Promise<TaskSnapshot | null> {
  const { rows } = await query(
    `SELECT t.title, t.item_details, t.status::text AS status,
            to_char(t.target_date, 'YYYY-MM-DD') AS target_date,
            t.category_id, t.account_id, t.publish_flag,
            to_char(t.focus_week_start, 'YYYY-MM-DD') AS focus_week_start, t.sla_days,
            COALESCE((SELECT array_agg(o.user_id::text ORDER BY o.user_id) FROM task_owners o WHERE o.task_id = t.id),
                     ARRAY[t.owner_id::text]) AS owner_ids,
            COALESCE((SELECT array_agg(tg.tag ORDER BY tg.tag) FROM task_tags tg WHERE tg.task_id = t.id), ARRAY[]::text[]) AS tags
     FROM tasks t WHERE t.id = $1`,
    [taskId]
  );
  return (rows[0] as TaskSnapshot) ?? null;
}

/** Only the fields that differ, as { field: [before, after] }. */
export function snapshotDiff(before: Record<string, any>, after: Record<string, any>) {
  const out: Record<string, [any, any]> = {};
  for (const k of FIELD_ORDER) {
    if (!(k in after)) continue;
    const a = norm(k, before[k]);
    const b = norm(k, after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}

/* ── Timeline ──────────────────────────────────────────────────────── */
const FIELD_ORDER = [
  "status", "title", "item_details", "target_date", "owner_ids", "category_id",
  "account_id", "focus_week_start", "tags", "publish_flag", "sla_days"
] as const;

const FIELD_LABEL: Record<string, string> = {
  status: "Status", title: "Title", item_details: "Details", target_date: "Due date",
  owner_ids: "Owners", category_id: "Category", account_id: "Account",
  focus_week_start: "Focus week", tags: "Tags", publish_flag: "Published", sla_days: "SLA days"
};

function norm(field: string, v: any): any {
  if (v === undefined || v === "") return null;
  if (field === "owner_ids" || field === "tags") {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    return [...new Set(arr.map(String))].sort();
  }
  if (field === "target_date" || field === "focus_week_start") {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }
  if (field === "sla_days") return v == null ? null : Number(v);
  if (field === "publish_flag") return v == null ? null : Boolean(v);
  if (typeof v === "string") return v.replace(/\r\n/g, "\n").trim();
  return v;
}

export type TimelineChange = { field: string; label: string; from: any; to: any };
export type TimelineEntry = {
  id: string;
  at: string;
  kind: "created" | "change" | "update" | "closure_requested" | "closure_approved" | "closure_rejected" | "closure_auto" | "escalated" | "update_requested";
  actor: { id: string | null; name: string | null } | null;
  text?: string;
  changes?: TimelineChange[];
};

export async function buildTimeline(taskId: string): Promise<TimelineEntry[]> {
  const [taskQ, auditQ, updatesQ, escQ, reqQ] = await Promise.all([
    query(`SELECT t.created_at, t.created_by, t.closure_requested_at, t.owner_id, u.name AS created_by_name
           FROM tasks t LEFT JOIN users u ON u.id = t.created_by WHERE t.id = $1`, [taskId]),
    query(`SELECT a.id, a.timestamp, a.changed_by, u.name AS changed_by_name, a.old_value, a.new_value
           FROM audit_log a LEFT JOIN users u ON u.id = a.changed_by
           WHERE a.entity_type = 'Task' AND a.entity_id = $1 ORDER BY a.timestamp`, [taskId]),
    query(`SELECT tu.id, tu.created_at, tu.body, tu.author_id, u.name AS author_name
           FROM task_updates tu LEFT JOIN users u ON u.id = tu.author_id
           WHERE tu.task_id = $1`, [taskId]),
    query(`SELECT e.id, e.created_at, e.rule_name, e.message, u.name AS notified_name
           FROM escalations e LEFT JOIN users u ON u.id = e.notified_user_id
           WHERE e.entity_type = 'Task' AND e.entity_id = $1 ORDER BY e.created_at`, [taskId]),
    query(`SELECT r.id, r.requested_at, r.note, r.requested_by, u.name AS requested_by_name
           FROM escalation_update_requests r LEFT JOIN users u ON u.id = r.requested_by
           WHERE r.entity_type = 'Task' AND r.entity_id = $1 ORDER BY r.requested_at`, [taskId])
  ]);
  const task = taskQ.rows[0];
  if (!task) return [];

  const entries: TimelineEntry[] = [];
  entries.push({
    id: `created-${taskId}`,
    at: task.created_at,
    kind: "created",
    actor: { id: task.created_by, name: task.created_by_name }
  });

  // Field state we know so far. Older edits stored only part of the previous
  // state (old_value) next to the whole submitted form (new_value), so each
  // older edit is compared with the best-known prior state; fields whose
  // prior value was never recorded aren't reported as changes.
  let known: Record<string, any> = {};
  let sawCloseRequest = false;
  const rawChanges: { id: string; at: string; actor: any; diff: Record<string, [any, any]> }[] = [];

  for (const a of auditQ.rows) {
    const oldV = a.old_value ?? {};
    const newV = a.new_value ?? {};
    const actor = { id: a.changed_by, name: a.changed_by_name };

    if (newV.action === "update_requested") continue; // shown from escalation_update_requests
    if (newV.action === "closure_requested") {
      sawCloseRequest = true;
      entries.push({ id: a.id, at: a.timestamp, kind: "closure_requested", actor });
      known.status = "Closed Pending Approval";
      continue;
    }
    if (newV.by === "system" && newV.status === "Closed Accepted") {
      entries.push({ id: a.id, at: a.timestamp, kind: "closure_auto", actor: null, text: newV.reason });
      known.status = "Closed Accepted";
      continue;
    }
    if (newV.closure_approved_by) {
      entries.push({ id: a.id, at: a.timestamp, kind: "closure_approved", actor });
      known.status = "Closed Accepted";
      continue;
    }
    if (newV.closure_rejected_by) {
      entries.push({ id: a.id, at: a.timestamp, kind: "closure_rejected", actor, text: newV.reason || undefined });
      known.status = "Open";
      continue;
    }

    let before: Record<string, any>;
    let after: Record<string, any>;
    if (newV._v === 2) {
      before = oldV;
      after = { ...newV };
      delete after._v;
    } else {
      // Legacy edit: old_value has a few real prior fields; new_value is the whole form.
      before = { ...known };
      for (const k of ["title", "item_details", "status", "focus_week_start"]) {
        if (k in oldV) before[k] = oldV[k];
      }
      after = { ...newV };
      // Only the primary owner was recorded; if it didn't change we can't tell
      // whether co-owners did, so say nothing about owners for this edit.
      if (!("owner_ids" in before) && oldV.owner_id) {
        before.owner_ids = [oldV.owner_id];
        if (!Array.isArray(newV.owner_ids) || newV.owner_ids[0] === oldV.owner_id) delete after.owner_ids;
      }
      // Fields whose previous value was never recorded can't be compared.
      for (const k of Object.keys(after)) if (!(k in before)) delete after[k];
    }
    const diff = snapshotDiff(before, after);
    // Whatever was submitted is now the known state, compared or not.
    const source = newV._v === 2 ? after : newV;
    for (const k of FIELD_ORDER) if (k in source) known[k] = source[k];
    if (Object.keys(diff).length) rawChanges.push({ id: a.id, at: a.timestamp, actor, diff });
  }

  // Before closure requests were audited, the request time lives on the task.
  if (!sawCloseRequest && task.closure_requested_at) {
    entries.push({ id: `close-req-${taskId}`, at: task.closure_requested_at, kind: "closure_requested", actor: null });
  }

  // Resolve ids (owners, category, account) to names for display.
  const userIds = new Set<string>();
  const catIds = new Set<string>();
  const accIds = new Set<string>();
  for (const c of rawChanges) {
    for (const [k, [from, to]] of Object.entries(c.diff)) {
      if (k === "owner_ids") [...(from ?? []), ...(to ?? [])].forEach((x: string) => userIds.add(x));
      if (k === "category_id") [from, to].forEach((x) => x && catIds.add(x));
      if (k === "account_id") [from, to].forEach((x) => x && accIds.add(x));
    }
  }
  const nameMap = new Map<string, string>();
  if (userIds.size) (await query(`SELECT id::text, name FROM users WHERE id::text = ANY($1)`, [[...userIds]])).rows.forEach((r) => nameMap.set(r.id, r.name));
  if (catIds.size) (await query(`SELECT id::text, name FROM categories WHERE id::text = ANY($1)`, [[...catIds]])).rows.forEach((r) => nameMap.set(r.id, r.name));
  if (accIds.size) (await query(`SELECT id::text, account_name AS name FROM accounts WHERE id::text = ANY($1)`, [[...accIds]])).rows.forEach((r) => nameMap.set(r.id, r.name));
  const nm = (x: any) => (x == null ? null : nameMap.get(String(x)) ?? "(removed)");

  for (const c of rawChanges) {
    const changes: TimelineChange[] = Object.entries(c.diff).map(([field, [from, to]]) => {
      if (field === "owner_ids") return { field, label: FIELD_LABEL[field], from: (from ?? []).map(nm), to: (to ?? []).map(nm) };
      if (field === "category_id" || field === "account_id") return { field, label: FIELD_LABEL[field], from: nm(from), to: nm(to) };
      return { field, label: FIELD_LABEL[field] ?? field, from, to };
    });
    entries.push({ id: c.id, at: c.at, kind: "change", actor: c.actor, changes });
  }

  for (const u of updatesQ.rows) {
    entries.push({ id: u.id, at: u.created_at, kind: "update", actor: { id: u.author_id, name: u.author_name }, text: u.body });
  }
  // Aging rules re-escalate every day; show each unbroken run of the same
  // rule as one entry ("repeated daily until …") instead of one per day.
  type Run = { id: string; rule: string; first: Date; last: Date; count: number; names: Set<string> };
  const runs: Run[] = [];
  const openRun = new Map<string, Run>();
  for (const e of escQ.rows) {
    const at = new Date(e.created_at);
    const cur = openRun.get(e.rule_name);
    if (cur && at.getTime() - cur.last.getTime() <= 3 * 86400000) {
      if (at.toDateString() !== cur.last.toDateString()) cur.count++;
      cur.last = at;
      if (e.notified_name) cur.names.add(e.notified_name);
    } else {
      const run: Run = { id: e.id, rule: e.rule_name, first: at, last: at, count: 1, names: new Set(e.notified_name ? [e.notified_name] : []) };
      runs.push(run);
      openRun.set(e.rule_name, run);
    }
  }
  for (const r of runs) {
    const to = r.names.size ? ` — escalated to ${[...r.names].join(", ")}` : "";
    const repeat = r.count > 1 ? ` · repeated daily until ${fmtDate(r.last.toISOString())} (${r.count} times)` : "";
    entries.push({ id: r.id, at: r.first.toISOString(), kind: "escalated", actor: null, text: `${r.rule}${to}${repeat}` });
  }
  reqQ.rows.forEach((r, i) => {
    entries.push({
      id: r.id, at: r.requested_at, kind: "update_requested",
      actor: { id: r.requested_by, name: r.requested_by_name },
      text: `${i === 0 ? "Requested an update" : `Sent reminder #${i + 1}`}${r.note ? `: "${r.note}"` : ""}`
    });
  });

  // Drop repeat clicks: the same closure action by the same person within 10 minutes.
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const deduped: TimelineEntry[] = [];
  const lastSeen = new Map<string, number>();
  for (const e of entries) {
    if (e.kind.startsWith("closure_")) {
      const k = `${e.kind}:${e.actor?.id ?? ""}`;
      const t = new Date(e.at).getTime();
      const prev = lastSeen.get(k);
      lastSeen.set(k, t);
      if (prev !== undefined && t - prev < 10 * 60000) continue;
    }
    deduped.push(e);
  }
  return deduped.reverse();
}

/* ── Email helpers ─────────────────────────────────────────────────── */
export function taskPath(taskId: string) {
  return `/tasks/${taskId}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Full task details as a two-column table for emails. */
export async function taskDetailsTable(taskId: string): Promise<{ table: Table; label: string; detailsText: string } | null> {
  const t = await loadTaskDetail(taskId);
  if (!t) return null;
  const rows: [string, string][] = [
    ["Task", t.title || t.item_details],
    ...(t.title ? [["Details", t.item_details] as [string, string]] : []),
    ["Dashboard", t.dashboard_name],
    ["Status", t.status],
    ["Due date", fmtDate(t.target_date)],
    ["Owners", t.owners.map((o: any) => o.name).join(", ")],
    ["Created by", t.created_by_name ?? "—"],
    ["Category", t.category_name ?? "—"],
    ["Account", t.account_name ?? "—"],
    ...(t.focus_week_start ? [["Focus week", `Week of ${fmtDate(t.focus_week_start)}`] as [string, string]] : []),
    ...(t.tags?.length ? [["Tags", t.tags.map((x: string) => `#${x}`).join(" ")] as [string, string]] : [])
  ];
  return {
    label: t.title || t.item_details,
    detailsText: t.item_details,
    table: { title: "Task details", columns: ["", ""], rows, layout: "details" }
  };
}
