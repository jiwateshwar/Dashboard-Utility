import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { getUserRole, hasDashboardAccess, isDashboardOwner, canEditDashboard, isAdminRole } from "../services/permission.js";
import { logAudit } from "../services/auditing.js";
import { notifyUser } from "../services/notifying.js";

const router = Router();
router.use(requireAuth);

async function notifyNewOwners(params: { taskId: string; dashboardId: string; dashboardName: string; label: string; newOwnerIds: string[]; actorUserId: string }) {
  const { taskId, dashboardId, dashboardName, label, newOwnerIds, actorUserId } = params;
  for (const oid of newOwnerIds) {
    if (oid === actorUserId) continue;
    await notifyUser({
      userId: oid,
      message: `You were assigned a task in ${dashboardName}: ${label}`,
      type: "task_assigned",
      entityType: "Task",
      entityId: taskId,
      dashboardId
    });
  }
}

async function notifyStatusChange(params: {
  taskId: string; dashboardId: string; dashboardName: string; label: string;
  oldStatus: string; newStatus: string; actorUserId: string; recipientIds: string[];
}) {
  const { taskId, dashboardId, dashboardName, label, oldStatus, newStatus, actorUserId, recipientIds } = params;
  const recipients = [...new Set(recipientIds)].filter((r) => r && r !== actorUserId);
  for (const recipientId of recipients) {
    await notifyUser({
      userId: recipientId,
      message: `Status of "${label}" changed from ${oldStatus} to ${newStatus} in ${dashboardName}`,
      type: "task_status_changed",
      entityType: "Task",
      entityId: taskId,
      dashboardId
    });
  }
}

/** Normalizes free-form hashtag input: trims, strips a leading '#', lowercases, dedupes. */
function normalizeTags(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const cleaned = t.trim().replace(/^#/, "").toLowerCase();
    if (cleaned) seen.add(cleaned);
  }
  return [...seen];
}

async function replaceTaskTags(taskId: string, tags: string[], userId: string) {
  await query(`DELETE FROM task_tags WHERE task_id = $1`, [taskId]);
  for (const tag of tags) {
    await query(
      `INSERT INTO task_tags (task_id, tag, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [taskId, tag, userId]
    );
  }
}

router.get("/", async (req, res) => {
  const { dashboard_id, include_archived } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const isAdmin = isAdminRole(role);
  const owner = await isDashboardOwner(userId, dashboard_id);
  const canView = isAdmin || owner || (await hasDashboardAccess(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const subordinates = await getSubordinateIds(userId);
  const fullAccess = owner || isAdmin; // owners and admins see all items on this dashboard

  // Recursive CTE: include child dashboards (up to 2 levels down = 3 total).
  // Own dashboard: normal access rules.
  // Child dashboards: only publish_flag=true items flow upward.
  const { rows } = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, name, 0 AS rel_depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT d.id, d.name, c.rel_depth + 1
       FROM dashboards d JOIN child_dashboards c ON d.parent_dashboard_id = c.id
       WHERE c.rel_depth < 2
     )
     SELECT t.*, u.name as owner_name,
            cd.name as source_dashboard_name, cd.id as source_dashboard_id,
            date_part('day', now() - t.created_at) as aging_days_calc,
            COALESCE(
              (SELECT array_agg(tow.user_id ORDER BY tow.user_id)
               FROM task_owners tow WHERE tow.task_id = t.id),
              ARRAY[t.owner_id]
            ) as owner_ids,
            COALESCE(
              (SELECT array_agg(ou.name ORDER BY tow.user_id)
               FROM task_owners tow JOIN users ou ON ou.id = tow.user_id WHERE tow.task_id = t.id),
              ARRAY[u.name]
            ) as owner_names,
            COALESCE(
              (SELECT array_agg(tg.tag ORDER BY tg.tag)
               FROM task_tags tg WHERE tg.task_id = t.id),
              ARRAY[]::text[]
            ) as tags
     FROM tasks t
     JOIN child_dashboards cd ON t.dashboard_id = cd.id
     JOIN users u ON u.id = t.owner_id
     WHERE ($5::boolean IS TRUE OR t.is_archived = false)
       AND (
         (cd.id = $1 AND (
           t.publish_flag = true OR
           t.owner_id = $2 OR
           t.created_by = $2 OR
           t.owner_id = ANY($3) OR
           t.created_by = ANY($3) OR
           EXISTS (SELECT 1 FROM task_owners to2 WHERE to2.task_id = t.id AND to2.user_id = $2) OR
           $4
         ))
         OR (cd.id != $1 AND t.publish_flag = true)
       )
     ORDER BY cd.rel_depth, t.created_at DESC`,
    [dashboard_id, userId, subordinates, fullAccess, include_archived === "true"]
  );

  res.json(rows.map((r) => ({ ...r, aging_days: r.aging_days_calc })));
});

// Cross-dashboard hashtag click-through — same visibility rule as the global (no dashboard_id) mode of GET /search:
// published, owned/created by me, or owned/created by a subordinate, or admin. No dashboard_access check,
// matching the existing global-search precedent in routes/search.ts.
router.get("/by-tag", async (req, res) => {
  const { tag } = req.query as any;
  if (!tag) return res.status(400).json({ error: "tag required" });
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const isAdmin = isAdminRole(role);
  const subordinates = await getSubordinateIds(userId);
  const normalizedTag = String(tag).trim().replace(/^#/, "").toLowerCase();

  const { rows } = await query(
    `SELECT t.*, u.name as owner_name, d.name as dashboard_name,
            COALESCE(
              (SELECT array_agg(tg.tag ORDER BY tg.tag)
               FROM task_tags tg WHERE tg.task_id = t.id),
              ARRAY[]::text[]
            ) as tags
     FROM tasks t
     JOIN task_tags tt ON tt.task_id = t.id AND tt.tag = $1
     JOIN users u ON u.id = t.owner_id
     JOIN dashboards d ON d.id = t.dashboard_id
     WHERE t.is_archived = false
       AND ($4::boolean IS TRUE OR
         t.publish_flag = true OR
         t.owner_id = $2 OR
         t.created_by = $2 OR
         t.owner_id = ANY($3) OR
         t.created_by = ANY($3) OR
         EXISTS (SELECT 1 FROM task_owners tow WHERE tow.task_id = t.id AND tow.user_id = $2)
       )
     ORDER BY t.created_at DESC`,
    [normalizedTag, userId, subordinates, isAdmin]
  );

  res.json(rows);
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const {
    dashboard_id,
    category_id,
    account_id,
    proposed_account_name,
    title,
    item_details,
    owner_ids,
    target_date,
    sla_days,
    publish_flag,
    tags,
    focus_week_start
  } = req.body as any;

  const ownerIdList: string[] = Array.isArray(owner_ids) ? owner_ids : (owner_ids ? [owner_ids] : []);

  if (!dashboard_id || !category_id || (!account_id && !proposed_account_name) || !item_details || ownerIdList.length === 0 || !target_date) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  // Auto-grant dashboard access (can_view + can_edit) to any owner who doesn't already have it
  for (const oid of ownerIdList) {
    const ownerAccess = await isDashboardOwner(oid, dashboard_id);
    const ownerRole = await getUserRole(oid);
    if (!isAdminRole(ownerRole) && !ownerAccess) {
      await query(
        `INSERT INTO dashboard_access (dashboard_id, user_id, can_view, can_edit)
         VALUES ($1, $2, true, true)
         ON CONFLICT (dashboard_id, user_id) DO UPDATE SET can_view = true, can_edit = true`,
        [dashboard_id, oid]
      );
    }
  }

  // Resolve account — either existing id or proposed new name
  let resolvedAccountId: string = account_id;
  if (!resolvedAccountId && proposed_account_name) {
    const trimmedName = proposed_account_name.trim();
    // Check if account with this name already exists (case-insensitive)
    const existing = await query(
      `SELECT id FROM accounts WHERE LOWER(account_name) = LOWER($1) LIMIT 1`,
      [trimmedName]
    );
    if (existing.rows.length > 0) {
      resolvedAccountId = existing.rows[0].id;
    } else {
      // Create as pending account
      const newAccId = uuid();
      await query(
        `INSERT INTO accounts (id, account_name, is_pending, proposed_by_user_id)
         VALUES ($1, $2, true, $3)`,
        [newAccId, trimmedName, userId]
      );
      resolvedAccountId = newAccId;
      // Notify all admins and superadmins
      const proposer = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
      const proposerName = proposer.rows[0]?.name ?? "A user";
      const admins = await query(
        `SELECT id FROM users WHERE role IN ('Admin', 'SuperAdmin') AND is_active = true`
      );
      for (const admin of admins.rows) {
        await query(
          `INSERT INTO notifications (id, user_id, message) VALUES ($1, $2, $3)`,
          [uuid(), admin.id,
            `${proposerName} proposed a new account: "${trimmedName}". Review it in Admin › Accounts.`]
        );
      }
    }
  }

  const account = await query(`SELECT is_active FROM accounts WHERE id = $1`, [resolvedAccountId]);
  if (account.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Account is deactivated" });
  }
  const category = await query(`SELECT is_active FROM categories WHERE id = $1`, [category_id]);
  if (category.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Category is deactivated" });
  }

  const id = uuid();
  // owner_id stores the primary (first) owner for backward compat with close-request logic
  await query(
    `INSERT INTO tasks
     (id, dashboard_id, category_id, account_id, title, item_details, owner_id, created_by, target_date, sla_days, status, publish_flag, focus_week_start)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open', $11, $12)`,
    [id, dashboard_id, category_id, resolvedAccountId, title || null, item_details, ownerIdList[0], userId, target_date, sla_days || null, publish_flag ?? false, focus_week_start || null]
  );

  // Insert all owners into junction table
  for (const oid of ownerIdList) {
    await query(`INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, oid]);
  }

  const tagList = normalizeTags(tags);
  if (tagList.length > 0) {
    await replaceTaskTags(id, tagList, userId);
  }

  const dash = await query(`SELECT name FROM dashboards WHERE id = $1`, [dashboard_id]);
  await notifyNewOwners({
    taskId: id,
    dashboardId: dashboard_id,
    dashboardName: dash.rows[0]?.name ?? "a dashboard",
    label: title || item_details,
    newOwnerIds: ownerIdList,
    actorUserId: userId
  });

  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const { title, item_details, owner_ids, target_date, publish_flag, status, category_id, tags, focus_week_start } = req.body as any;

  const task = await query(
    `SELECT t.dashboard_id, t.owner_id, t.created_by, t.status, t.focus_week_start, t.title, t.item_details, d.name as dashboard_name
     FROM tasks t JOIN dashboards d ON d.id = t.dashboard_id
     WHERE t.id = $1`,
    [id]
  );
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = task.rows[0].dashboard_id as string;
  const oldStatus = task.rows[0].status as string;
  const dashboardName = task.rows[0].dashboard_name as string;
  const label = task.rows[0].title || task.rows[0].item_details;

  const canEdit = await canEditDashboard(userId, dashboardId);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  // 'Closed Accepted' must only be reached via POST /:id/approve, which enforces who may
  // accept a closure and records closure_approved_by — PATCH bypassed that entirely before.
  if (status === "Closed Accepted" && oldStatus !== "Closed Accepted") {
    return res.status(400).json({ error: "Use the Approve action to accept a task's closure" });
  }

  // Only enforce the stricter focus-week permission when the value is actually changing —
  // edit forms always resend the current value, and that shouldn't block unrelated edits.
  const currentFocusWeek = task.rows[0].focus_week_start
    ? new Date(task.rows[0].focus_week_start).toISOString().slice(0, 10)
    : null;
  const focusWeekProvided = Object.prototype.hasOwnProperty.call(req.body, "focus_week_start")
    && (focus_week_start || null) !== currentFocusWeek;
  if (focusWeekProvided) {
    const role = await getUserRole(userId);
    const isTaskOwner = task.rows[0].owner_id === userId ||
      (await query(`SELECT 1 FROM task_owners WHERE task_id = $1 AND user_id = $2`, [id, userId])).rows.length > 0;
    const isCreator = task.rows[0].created_by === userId;
    const isOwnerOfDash = await isDashboardOwner(userId, dashboardId);
    const canSetFocus = isAdminRole(role) || isOwnerOfDash || isTaskOwner || isCreator;
    if (!canSetFocus) {
      return res.status(403).json({ error: "Only the creator, an owner, a dashboard owner, or an admin can set the focus week" });
    }
  }

  const ownerIdList: string[] | undefined = Array.isArray(owner_ids) ? owner_ids : undefined;

  const existingOwners = await query(`SELECT user_id FROM task_owners WHERE task_id = $1`, [id]);
  const existingOwnerIds: string[] = existingOwners.rows.map((r: any) => r.user_id);
  const newlyAddedOwners = ownerIdList ? ownerIdList.filter((oid) => !existingOwnerIds.includes(oid)) : [];
  const finalOwnerIds = ownerIdList && ownerIdList.length > 0 ? ownerIdList : existingOwnerIds;

  if (ownerIdList && ownerIdList.length > 0) {
    for (const oid of ownerIdList) {
      const ownerAccess = await isDashboardOwner(oid, dashboardId);
      const ownerRole = await getUserRole(oid);
      if (!isAdminRole(ownerRole) && !ownerAccess) {
        await query(
          `INSERT INTO dashboard_access (dashboard_id, user_id, can_view, can_edit)
           VALUES ($1, $2, true, true)
           ON CONFLICT (dashboard_id, user_id) DO UPDATE SET can_view = true, can_edit = true`,
          [dashboardId, oid]
        );
      }
    }
  }

  const primaryOwnerId = ownerIdList && ownerIdList.length > 0 ? ownerIdList[0] : null;

  await query(
    `UPDATE tasks
     SET title = COALESCE($2, title),
         item_details = COALESCE($3, item_details),
         owner_id = COALESCE($4, owner_id),
         target_date = COALESCE($5, target_date),
         publish_flag = COALESCE($6, publish_flag),
         status = COALESCE($7, status),
         category_id = COALESCE($8, category_id),
         focus_week_start = CASE WHEN $9 THEN $10 ELSE focus_week_start END,
         closure_approved_at = CASE
           WHEN $7 = 'Dropped' AND closure_approved_at IS NULL THEN now()
           ELSE closure_approved_at
         END,
         updated_at = now()
     WHERE id = $1`,
    [id, title || null, item_details || null, primaryOwnerId, target_date || null, publish_flag, status || null, category_id || null, focusWeekProvided, focus_week_start || null]
  );

  if (ownerIdList && ownerIdList.length > 0) {
    await query(`DELETE FROM task_owners WHERE task_id = $1`, [id]);
    for (const oid of ownerIdList) {
      await query(`INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, oid]);
    }
  }

  if (Array.isArray(tags)) {
    await replaceTaskTags(id, normalizeTags(tags), userId);
  }

  if (newlyAddedOwners.length > 0) {
    await notifyNewOwners({ taskId: id, dashboardId, dashboardName, label, newOwnerIds: newlyAddedOwners, actorUserId: userId });
  }
  if (status && status !== oldStatus) {
    await notifyStatusChange({
      taskId: id, dashboardId, dashboardName, label,
      oldStatus, newStatus: status, actorUserId: userId,
      recipientIds: [task.rows[0].created_by, ...finalOwnerIds]
    });
  }

  await logAudit({ entityType: "Task", entityId: id, changedBy: userId, oldValue: task.rows[0], newValue: req.body });

  res.json({ ok: true });
});

router.post("/:id/close-request", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(
    `SELECT t.dashboard_id, t.owner_id, t.created_by, t.title, t.item_details, d.name as dashboard_name
     FROM tasks t JOIN dashboards d ON d.id = t.dashboard_id
     WHERE t.id = $1`,
    [id]
  );
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });

  const isOwner = await query(`SELECT 1 FROM task_owners WHERE task_id = $1 AND user_id = $2`, [id, userId]);
  if (task.rows[0].owner_id !== userId && isOwner.rows.length === 0) {
    return res.status(403).json({ error: "Only an owner can request closure" });
  }

  await query(
    `UPDATE tasks
     SET status = 'Closed Pending Approval', closure_requested_at = now(), updated_at = now()
     WHERE id = $1`,
    [id]
  );

  await notifyStatusChange({
    taskId: id,
    dashboardId: task.rows[0].dashboard_id,
    dashboardName: task.rows[0].dashboard_name,
    label: task.rows[0].title || task.rows[0].item_details,
    oldStatus: "Open/In Progress",
    newStatus: "Closed Pending Approval",
    actorUserId: userId,
    recipientIds: [task.rows[0].created_by]
  });

  res.json({ ok: true });
});

router.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(
    `SELECT t.dashboard_id, t.created_by, t.title, t.item_details, d.name as dashboard_name
     FROM tasks t JOIN dashboards d ON d.id = t.dashboard_id
     WHERE t.id = $1`,
    [id]
  );
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });

  const dashboardId = task.rows[0].dashboard_id as string;
  const creatorId = task.rows[0].created_by as string;

  const role = await getUserRole(userId);
  if (userId !== creatorId && !isAdminRole(role)) {
    return res.status(403).json({ error: "Only the task's creator (or an admin) can approve its closure" });
  }

  await query(
    `UPDATE tasks
     SET status = 'Closed Accepted', closure_approved_by = $2, closure_approved_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, userId]
  );

  const owners = await query(`SELECT user_id FROM task_owners WHERE task_id = $1`, [id]);
  await notifyStatusChange({
    taskId: id,
    dashboardId,
    dashboardName: task.rows[0].dashboard_name,
    label: task.rows[0].title || task.rows[0].item_details,
    oldStatus: "Closed Pending Approval",
    newStatus: "Closed Accepted",
    actorUserId: userId,
    recipientIds: owners.rows.map((r: any) => r.user_id)
  });

  await logAudit({
    entityType: "Task",
    entityId: id,
    changedBy: userId,
    oldValue: { status: "Closed Pending Approval" },
    newValue: { status: "Closed Accepted", closure_approved_by: userId }
  });

  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(`SELECT dashboard_id FROM tasks WHERE id = $1`, [id]);
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = task.rows[0].dashboard_id as string;
  const isOwner = await isDashboardOwner(userId, dashboardId);
  const role = await getUserRole(userId);
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Only owners can delete tasks" });
  await query(`DELETE FROM tasks WHERE id = $1`, [id]);
  res.json({ ok: true });
});

export default router;
