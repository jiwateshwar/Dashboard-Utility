import { Router } from "express";
import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { getUserRole, hasDashboardAccess, isDashboardOwner, canEditDashboard } from "../services/permission.js";
import { logAudit } from "../services/auditing.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { dashboard_id, include_archived } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const canEdit = await canEditDashboard(userId, dashboard_id);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  const subordinates = await getSubordinateIds(userId);
  const owner = await isDashboardOwner(userId, dashboard_id);

  const { rows } = await query(
    `SELECT t.*, u.name as owner_name,
            date_part('day', now() - t.created_at) as aging_days_calc
     FROM tasks t
     JOIN users u ON u.id = t.owner_id
     WHERE t.dashboard_id = $1
       AND ($5::boolean IS TRUE OR t.is_archived = false)
       AND (
         t.publish_flag = true OR
         t.owner_id = $2 OR
         t.created_by = $2 OR
         t.owner_id = ANY($3) OR
         t.created_by = ANY($3) OR
         $4
       )`,
    [dashboard_id, userId, subordinates, owner, include_archived === "true"]
  );

  res.json(rows.map((r) => ({ ...r, aging_days: r.aging_days_calc })));
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const {
    dashboard_id,
    category_id,
    account_id,
    item_details,
    owner_id,
    target_date,
    sla_days,
    rag_status,
    publish_flag
  } = req.body as any;

  if (!dashboard_id || !category_id || !account_id || !item_details || !owner_id || !target_date) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const canView = (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const access = await query(
    `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_view = true`,
    [dashboard_id, owner_id]
  );
  const ownerAccess = await isDashboardOwner(owner_id, dashboard_id);
  if (access.rows.length === 0 && !ownerAccess) {
    return res.status(400).json({ error: "User does not have access to this dashboard. Please grant access before assigning." });
  }

  const account = await query(`SELECT is_active FROM accounts WHERE id = $1`, [account_id]);
  if (account.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Account is deactivated" });
  }
  const category = await query(`SELECT is_active FROM categories WHERE id = $1`, [category_id]);
  if (category.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Category is deactivated" });
  }

  const id = uuid();
  await query(
    `INSERT INTO tasks
     (id, dashboard_id, category_id, account_id, item_details, owner_id, created_by, target_date, sla_days, status, rag_status, publish_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Open', $10, $11)`,
    [id, dashboard_id, category_id, account_id, item_details, owner_id, userId, target_date, sla_days || null, rag_status || "Green", publish_flag ?? false]
  );

  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const { item_details, owner_id, target_date, rag_status, publish_flag, status } = req.body as any;

  const task = await query(`SELECT dashboard_id, owner_id, created_by, status FROM tasks WHERE id = $1`, [id]);
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = task.rows[0].dashboard_id as string;

  const canEdit = await canEditDashboard(userId, dashboardId);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  if (owner_id) {
    const access = await query(
      `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_view = true`,
      [dashboardId, owner_id]
    );
    const ownerAccess = await isDashboardOwner(owner_id, dashboardId);
    if (access.rows.length === 0 && !ownerAccess) {
      return res.status(400).json({ error: "User does not have access to this dashboard. Please grant access before assigning." });
    }
  }

  await query(
    `UPDATE tasks
     SET item_details = COALESCE($2, item_details),
         owner_id = COALESCE($3, owner_id),
         target_date = COALESCE($4, target_date),
         rag_status = COALESCE($5, rag_status),
         publish_flag = COALESCE($6, publish_flag),
         status = COALESCE($7, status),
         updated_at = now()
     WHERE id = $1`,
    [id, item_details || null, owner_id || null, target_date || null, rag_status || null, publish_flag, status || null]
  );

  await logAudit({ entityType: "Task", entityId: id, changedBy: userId, oldValue: task.rows[0], newValue: req.body });

  res.json({ ok: true });
});

router.post("/:id/close-request", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const task = await query(`SELECT dashboard_id, owner_id FROM tasks WHERE id = $1`, [id]);
  if (task.rows.length === 0) return res.status(404).json({ error: "Not found" });

  if (task.rows[0].owner_id !== userId) {
    return res.status(403).json({ error: "Only owner can request closure" });
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
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Only owners can delete tasks" });
  await query(`DELETE FROM tasks WHERE id = $1`, [id]);
  res.json({ ok: true });
});

export default router;
