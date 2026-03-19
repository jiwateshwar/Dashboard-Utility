import { Router } from "express";
import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { getUserRole, hasDashboardAccess, isDashboardOwner, canEditDashboard, isAdminRole } from "../services/permission.js";
import { logAudit } from "../services/auditing.js";

const router = Router();
router.use(requireAuth);

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
            ) as owner_names
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
    publish_flag
  } = req.body as any;

  const ownerIdList: string[] = Array.isArray(owner_ids) ? owner_ids : (owner_ids ? [owner_ids] : []);

  if (!dashboard_id || !category_id || (!account_id && !proposed_account_name) || !item_details || ownerIdList.length === 0 || !target_date) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  // Validate all owners have dashboard access
  for (const oid of ownerIdList) {
    const access = await query(
      `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_view = true`,
      [dashboard_id, oid]
    );
    const ownerAccess = await isDashboardOwner(oid, dashboard_id);
    const ownerRole = await getUserRole(oid);
    if (access.rows.length === 0 && !ownerAccess && !isAdminRole(ownerRole)) {
      const u = await query(`SELECT name FROM users WHERE id = $1`, [oid]);
      const name = u.rows[0]?.name ?? oid;
      return res.status(400).json({ error: `${name} does not have access to this dashboard. Please grant access before assigning.` });
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
     (id, dashboard_id, category_id, account_id, title, item_details, owner_id, created_by, target_date, sla_days, status, publish_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Open', $11)`,
    [id, dashboard_id, category_id, resolvedAccountId, title || null, item_details, ownerIdList[0], userId, target_date, sla_days || null, publish_flag ?? false]
  );

  // Insert all owners into junction table
  for (const oid of ownerIdList) {
    await query(`INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, oid]);
  }

  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const { title, item_details, owner_ids, target_date, publish_flag, status } = req.body as any;

  const task = await query(`SELECT dashboard_id, owner_id, created_by, status FROM tasks WHERE id = $1`, [id]);
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = task.rows[0].dashboard_id as string;

  const canEdit = await canEditDashboard(userId, dashboardId);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  const ownerIdList: string[] | undefined = Array.isArray(owner_ids) ? owner_ids : undefined;

  if (ownerIdList && ownerIdList.length > 0) {
    for (const oid of ownerIdList) {
      const access = await query(
        `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_view = true`,
        [dashboardId, oid]
      );
      const ownerAccess = await isDashboardOwner(oid, dashboardId);
      const ownerRole = await getUserRole(oid);
      if (access.rows.length === 0 && !ownerAccess && !isAdminRole(ownerRole)) {
        const u = await query(`SELECT name FROM users WHERE id = $1`, [oid]);
        const name = u.rows[0]?.name ?? oid;
        return res.status(400).json({ error: `${name} does not have access to this dashboard. Please grant access before assigning.` });
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
         updated_at = now()
     WHERE id = $1`,
    [id, title || null, item_details || null, primaryOwnerId, target_date || null, publish_flag, status || null]
  );

  if (ownerIdList && ownerIdList.length > 0) {
    await query(`DELETE FROM task_owners WHERE task_id = $1`, [id]);
    for (const oid of ownerIdList) {
      await query(`INSERT INTO task_owners (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, oid]);
    }
  }

  await logAudit({ entityType: "Task", entityId: id, changedBy: userId, oldValue: task.rows[0], newValue: req.body });

  res.json({ ok: true });
});

router.post("/:id/close-request", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(`SELECT dashboard_id, owner_id FROM tasks WHERE id = $1`, [id]);
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
  res.json({ ok: true });
});

router.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(
    `SELECT dashboard_id, created_by FROM tasks WHERE id = $1`,
    [id]
  );
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });

  const dashboardId = task.rows[0].dashboard_id as string;
  const creatorId = task.rows[0].created_by as string;

  const manager = await query(`SELECT manager_id FROM users WHERE id = $1`, [creatorId]);
  const creatorManagerId = manager.rows[0]?.manager_id;
  const isOwner = await isDashboardOwner(userId, dashboardId);

  if (![creatorId, creatorManagerId].includes(userId) && !isOwner) {
    return res.status(403).json({ error: "Not allowed to approve" });
  }

  await query(
    `UPDATE tasks
     SET status = 'Closed Accepted', closure_approved_by = $2, closure_approved_at = now(), updated_at = now()
     WHERE id = $1`,
    [id, userId]
  );

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
