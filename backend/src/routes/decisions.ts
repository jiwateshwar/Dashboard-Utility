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

function decisionRag(deadline: string) {
  const diff = dayjs().diff(dayjs(deadline), "day");
  if (diff > 5) return "Red";
  if (diff > 0) return "Amber";
  return "Green";
}

router.get("/", async (req, res) => {
  const { dashboard_id, include_archived } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const canEdit = await canEditDashboard(userId, dashboard_id);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  const subordinates = await getSubordinateIds(userId);
  const owner = await isDashboardOwner(userId, dashboard_id);

  const { rows } = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, name, 0 AS rel_depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT d2.id, d2.name, c.rel_depth + 1
       FROM dashboards d2 JOIN child_dashboards c ON d2.parent_dashboard_id = c.id
       WHERE c.rel_depth < 2
     )
     SELECT d.*, u.name as owner_name,
            cd.name as source_dashboard_name, cd.id as source_dashboard_id
     FROM decisions d
     JOIN child_dashboards cd ON d.dashboard_id = cd.id
     JOIN users u ON u.id = d.decision_owner
     WHERE ($5::boolean IS TRUE OR d.is_archived = false)
       AND (
         (cd.id = $1 AND (
           d.publish_flag = true OR
           d.decision_owner = $2 OR
           d.created_by = $2 OR
           d.decision_owner = ANY($3) OR
           d.created_by = ANY($3) OR
           $4
         ))
         OR (cd.id != $1 AND d.publish_flag = true)
       )
     ORDER BY cd.rel_depth, d.created_at DESC`,
    [dashboard_id, userId, subordinates, owner, include_archived === "true"]
  );

  res.json(rows.map((r) => ({ ...r, decision_rag: decisionRag(r.decision_deadline) })));
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const {
    dashboard_id,
    account_id,
    decision_title,
    decision_context,
    decision_owner,
    decision_deadline,
    impact_area,
    status,
    publish_flag
  } = req.body as any;

  if (!dashboard_id || !account_id || !decision_title || !decision_owner || !decision_deadline) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const canView = (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const account = await query(`SELECT is_active FROM accounts WHERE id = $1`, [account_id]);
  if (account.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Account is deactivated" });
  }

  const id = uuid();
  await query(
    `INSERT INTO decisions
     (id, dashboard_id, account_id, decision_title, decision_context, decision_owner, decision_deadline, impact_area, status, publish_flag, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, dashboard_id, account_id, decision_title, decision_context || null, decision_owner, decision_deadline, impact_area || null, status || "Pending", publish_flag ?? false, userId]
  );

  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const decision = await query(`SELECT dashboard_id FROM decisions WHERE id = $1`, [id]);
  if (decision.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = decision.rows[0].dashboard_id as string;

  const canEdit = await canEditDashboard(userId, dashboardId);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  await query(
    `UPDATE decisions
     SET decision_title = COALESCE($2, decision_title),
         decision_context = COALESCE($3, decision_context),
         decision_owner = COALESCE($4, decision_owner),
         decision_deadline = COALESCE($5, decision_deadline),
         impact_area = COALESCE($6, impact_area),
         status = COALESCE($7, status),
         publish_flag = COALESCE($8, publish_flag),
         updated_at = now()
     WHERE id = $1`,
    [
      id,
      req.body.decision_title || null,
      req.body.decision_context || null,
      req.body.decision_owner || null,
      req.body.decision_deadline || null,
      req.body.impact_area || null,
      req.body.status || null,
      req.body.publish_flag
    ]
  );

  await logAudit({ entityType: "Decision", entityId: id, changedBy: userId, oldValue: decision.rows[0], newValue: req.body });

  res.json({ ok: true });
});

router.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const decision = await query(`SELECT dashboard_id FROM decisions WHERE id = $1`, [id]);
  if (decision.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = decision.rows[0].dashboard_id as string;

  const owner = await isDashboardOwner(userId, dashboardId);
  if (!owner) return res.status(403).json({ error: "Owners only" });

  await query(
    `UPDATE decisions
     SET status = 'Approved', approved_by = $2, decision_date = now(), updated_at = now()
     WHERE id = $1`,
    [id, userId]
  );
  await logAudit({
    entityType: "Decision",
    entityId: id,
    changedBy: userId,
    oldValue: { status: "Pending" },
    newValue: { status: "Approved", approved_by: userId }
  });
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const decision = await query(`SELECT dashboard_id FROM decisions WHERE id = $1`, [id]);
  if (decision.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = decision.rows[0].dashboard_id as string;
  const isOwner = await isDashboardOwner(userId, dashboardId);
  const role = await getUserRole(userId);
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Only owners can delete decisions" });
  await query(`DELETE FROM decisions WHERE id = $1`, [id]);
  res.json({ ok: true });
});

export default router;
