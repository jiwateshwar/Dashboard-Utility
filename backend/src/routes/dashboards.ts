import { Router } from "express";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isDashboardOwner, hasDashboardAccess } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const { rows } = await query(
    `SELECT d.*,
       (SELECT json_agg(json_build_object('user_id', dbo2.user_id, 'name', u.name) ORDER BY u.name)
        FROM dashboard_owners dbo2 JOIN users u ON u.id = dbo2.user_id
        WHERE dbo2.dashboard_id = d.id) as owners
     FROM dashboards d
     WHERE d.id IN (
       SELECT dashboard_id FROM dashboard_owners WHERE user_id = $1
       UNION
       SELECT dashboard_id FROM dashboard_access WHERE user_id = $1
     )`,
    [userId]
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (role !== "Admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  const { name, description, owner_ids } = req.body as any;
  if (!name || !Array.isArray(owner_ids) || owner_ids.length === 0) {
    return res.status(400).json({ error: "name and at least one owner_id required" });
  }
  const id = uuid();
  await query(
    `INSERT INTO dashboards (id, name, description, primary_owner_id)
     VALUES ($1, $2, $3, $4)`,
    [id, name, description || null, owner_ids[0]]
  );
  for (const uid of owner_ids) {
    await query(
      `INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, uid]
    );
  }
  res.json({ id });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const { rows } = await query(
    `SELECT d.* FROM dashboards d
     WHERE d.id = $1 AND d.id IN (
       SELECT dashboard_id FROM dashboard_owners WHERE user_id = $2
       UNION
       SELECT dashboard_id FROM dashboard_access WHERE user_id = $2
     )`,
    [id, userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  if (role !== "Admin" && !(await isDashboardOwner(userId, id))) {
    return res.status(403).json({ error: "Not allowed" });
  }
  const { name, description, is_active } = req.body as any;
  await query(
    `UPDATE dashboards
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         is_active = COALESCE($4, is_active),
         updated_at = now()
     WHERE id = $1`,
    [id, name || null, description || null, is_active]
  );
  res.json({ ok: true });
});

// ── Owners management ──────────────────────────────────────────

router.get("/:id/owners", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Not allowed" });

  const { rows } = await query(
    `SELECT dbo.user_id, u.name, u.email
     FROM dashboard_owners dbo
     JOIN users u ON u.id = dbo.user_id
     WHERE dbo.dashboard_id = $1
     ORDER BY u.name`,
    [id]
  );
  res.json(rows);
});

// Replace all owners atomically
router.put("/:id/owners", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Not allowed" });

  const { owner_ids } = req.body as any;
  if (!Array.isArray(owner_ids) || owner_ids.length === 0) {
    return res.status(400).json({ error: "At least one owner required" });
  }

  await query(`DELETE FROM dashboard_owners WHERE dashboard_id = $1`, [id]);
  for (const uid of owner_ids) {
    await query(
      `INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, uid]
    );
  }
  // Keep primary_owner_id in sync for legacy compat
  await query(
    `UPDATE dashboards SET primary_owner_id = $2, secondary_owner_id = NULL WHERE id = $1`,
    [id, owner_ids[0]]
  );
  res.json({ ok: true });
});

// ── Summary ────────────────────────────────────────────────────

router.get("/:id/summary", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const canView = (await hasDashboardAccess(userId, id)) || (await isDashboardOwner(userId, id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const tasks = await query(
    `SELECT status, rag_status, created_at FROM tasks WHERE dashboard_id = $1 AND is_archived = false`,
    [id]
  );
  const risks = await query(
    `SELECT status, impact_level, probability, target_mitigation_date FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
    [id]
  );
  const decisions = await query(
    `SELECT status, decision_deadline FROM decisions WHERE dashboard_id = $1 AND is_archived = false`,
    [id]
  );

  const taskStats = {
    open: tasks.rows.filter((t) => t.status === "Open").length,
    inProgress: tasks.rows.filter((t) => t.status === "In Progress").length,
    red: tasks.rows.filter((t) => t.rag_status === "Red").length,
    pendingApproval: tasks.rows.filter((t) => t.status === "Closed Pending Approval").length
  };
  const riskStats = {
    totalActive: risks.rows.filter((r) => r.status !== "Closed").length,
    red: risks.rows.filter((r) => r.impact_level === "Critical").length,
    overdueMitigations: risks.rows.filter((r) => r.status !== "Closed" && r.target_mitigation_date && dayjs().isAfter(dayjs(r.target_mitigation_date))).length
  };
  const decisionStats = {
    pending: decisions.rows.filter((d) => d.status === "Pending").length,
    overdue: decisions.rows.filter((d) => d.status === "Pending" && dayjs().isAfter(dayjs(d.decision_deadline))).length
  };

  const totalItems = taskStats.open + taskStats.inProgress + riskStats.totalActive + decisionStats.pending;
  const redCount = taskStats.red + riskStats.red;
  const overdueCount = riskStats.overdueMitigations + decisionStats.overdue;
  const agingTasks = tasks.rows.filter((t) => dayjs().diff(dayjs(t.created_at), "day") > 20).length;
  const riskFactor = redCount + overdueCount + agingTasks;
  const healthScore = totalItems === 0 ? 100 : Math.max(0, 100 - Math.round((riskFactor / totalItems) * 100));

  res.json({ taskStats, riskStats, decisionStats, healthScore });
});

// ── Access management ──────────────────────────────────────────

router.post("/:id/access", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Not allowed" });
  const { target_user_id, can_view, can_edit } = req.body as any;
  if (!target_user_id) return res.status(400).json({ error: "Missing target_user_id" });
  await query(
    `INSERT INTO dashboard_access (dashboard_id, user_id, can_view, can_edit)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (dashboard_id, user_id)
     DO UPDATE SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit`,
    [id, target_user_id, can_view ?? true, can_edit ?? false]
  );
  res.json({ ok: true });
});

router.get("/:id/access", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Owners only" });

  const { rows } = await query(
    `SELECT da.dashboard_id, da.user_id, da.can_view, da.can_edit, u.name, u.email
     FROM dashboard_access da
     JOIN users u ON u.id = da.user_id
     WHERE da.dashboard_id = $1
     ORDER BY u.name`,
    [id]
  );
  res.json(rows);
});

export default router;
