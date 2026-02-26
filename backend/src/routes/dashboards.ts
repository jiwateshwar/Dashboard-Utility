import { Router } from "express";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isDashboardOwner, hasDashboardAccess, isAdminRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

// ── Hierarchy helpers ───────────────────────────────────────────

/** Depth of dashboardId from the root (root = 1). */
async function depthFromRoot(dashboardId: string): Promise<number> {
  const { rows } = await query(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_dashboard_id, 1 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT d.id, d.parent_dashboard_id, c.depth + 1
       FROM dashboards d JOIN chain c ON d.id = c.parent_dashboard_id
       WHERE c.depth < 6
     )
     SELECT MAX(depth) AS depth FROM chain`,
    [dashboardId]
  );
  return Number(rows[0]?.depth ?? 1);
}

/** Height of the subtree rooted at dashboardId (leaf = 1). */
async function subtreeHeight(dashboardId: string): Promise<number> {
  const { rows } = await query(
    `WITH RECURSIVE sub AS (
       SELECT id, 1 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT d.id, s.depth + 1
       FROM dashboards d JOIN sub s ON d.parent_dashboard_id = s.id
       WHERE s.depth < 6
     )
     SELECT MAX(depth) AS height FROM sub`,
    [dashboardId]
  );
  return Number(rows[0]?.height ?? 1);
}

/**
 * Validates that setting dashboardId's parent to parentId does not:
 *   - create a cycle
 *   - exceed 3 total levels
 * Returns an error string or null if valid.
 * Pass dashboardId=null for a brand-new dashboard (no existing subtree).
 */
async function validateParent(dashboardId: string | null, parentId: string): Promise<string | null> {
  // Cycle check: parentId must not be a descendant of dashboardId
  if (dashboardId) {
    const { rows } = await query(
      `WITH RECURSIVE sub AS (
         SELECT id FROM dashboards WHERE id = $1
         UNION ALL
         SELECT d.id FROM dashboards d JOIN sub s ON d.parent_dashboard_id = s.id
       )
       SELECT 1 FROM sub WHERE id = $2`,
      [dashboardId, parentId]
    );
    if (rows.length > 0) return "Cannot create a circular hierarchy";
  }

  // Depth check
  const pd = await depthFromRoot(parentId);
  const sh = dashboardId ? await subtreeHeight(dashboardId) : 1;
  if (pd + sh > 3) {
    return `This would exceed the maximum of 3 hierarchy levels (parent is at level ${pd}, subtree height is ${sh})`;
  }
  return null;
}

// ── Routes ──────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const { rows } = await query(
    `SELECT d.*,
       (SELECT json_agg(json_build_object('user_id', dbo2.user_id, 'name', u.name) ORDER BY u.name)
        FROM dashboard_owners dbo2 JOIN users u ON u.id = dbo2.user_id
        WHERE dbo2.dashboard_id = d.id) as owners,
       pd.name AS parent_dashboard_name
     FROM dashboards d
     LEFT JOIN dashboards pd ON pd.id = d.parent_dashboard_id
     WHERE $1 OR d.id IN (
       SELECT dashboard_id FROM dashboard_owners WHERE user_id = $2
       UNION
       SELECT dashboard_id FROM dashboard_access WHERE user_id = $2
     )`,
    [isAdminRole(role), userId]
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) {
    return res.status(403).json({ error: "Admin only" });
  }
  const { name, description, owner_ids, parent_dashboard_id } = req.body as any;
  if (!name || !Array.isArray(owner_ids) || owner_ids.length === 0) {
    return res.status(400).json({ error: "name and at least one owner_id required" });
  }

  if (parent_dashboard_id) {
    const err = await validateParent(null, parent_dashboard_id);
    if (err) return res.status(400).json({ error: err });
  }

  const id = uuid();
  await query(
    `INSERT INTO dashboards (id, name, description, primary_owner_id, parent_dashboard_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, name, description || null, owner_ids[0], parent_dashboard_id || null]
  );
  for (const uid of owner_ids) {
    await query(
      `INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, uid]
    );
  }
  // Auto-seed fixed categories for every new dashboard
  await query(
    `INSERT INTO categories (id, dashboard_id, name, is_active) VALUES
     (gen_random_uuid(), $1, 'Highlights', true),
     (gen_random_uuid(), $1, 'Lowlights', true)`,
    [id]
  );
  res.json({ id });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const { rows } = await query(
    `SELECT d.*, pd.name AS parent_dashboard_name
     FROM dashboards d
     LEFT JOIN dashboards pd ON pd.id = d.parent_dashboard_id
     WHERE d.id = $1 AND ($2 OR d.id IN (
       SELECT dashboard_id FROM dashboard_owners WHERE user_id = $3
       UNION
       SELECT dashboard_id FROM dashboard_access WHERE user_id = $3
     ))`,
    [id, isAdminRole(role), userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  if (!isAdminRole(role) && !(await isDashboardOwner(userId, id))) {
    return res.status(403).json({ error: "Not allowed" });
  }
  const { name, description, is_active, parent_dashboard_id } = req.body as any;

  // Validate hierarchy if parent is being changed
  if (parent_dashboard_id !== undefined) {
    if (parent_dashboard_id !== null) {
      const err = await validateParent(id, parent_dashboard_id);
      if (err) return res.status(400).json({ error: err });
    }
    await query(
      `UPDATE dashboards
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           is_active = COALESCE($4, is_active),
           parent_dashboard_id = $5,
           updated_at = now()
       WHERE id = $1`,
      [id, name || null, description || null, is_active, parent_dashboard_id]
    );
  } else {
    await query(
      `UPDATE dashboards
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           is_active = COALESCE($4, is_active),
           updated_at = now()
       WHERE id = $1`,
      [id, name || null, description || null, is_active]
    );
  }
  res.json({ ok: true });
});

// ── Owners management ──────────────────────────────────────────

router.get("/:id/owners", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Not allowed" });

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
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Not allowed" });

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
  await query(
    `UPDATE dashboards SET primary_owner_id = $2, secondary_owner_id = NULL WHERE id = $1`,
    [id, owner_ids[0]]
  );
  res.json({ ok: true });
});

// ── Summary (includes inherited items from children) ────────────

router.get("/:id/summary", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, id)) || (await isDashboardOwner(userId, id));
  if (!canView) return res.status(403).json({ error: "No access" });

  // Single query with the recursive CTE computed once, then used across tasks/risks/decisions
  const { rows: raw } = await query(
    `WITH RECURSIVE children AS (
       SELECT id FROM dashboards WHERE id = $1
       UNION ALL
       SELECT d.id FROM dashboards d JOIN children c ON d.parent_dashboard_id = c.id
     ),
     t AS (
       SELECT 'task' AS kind, status::text AS status, target_date::text AS deadline, created_at, NULL::text AS impact_level
       FROM tasks
       WHERE dashboard_id IN (SELECT id FROM children) AND is_archived = false
         AND (dashboard_id = $1 OR publish_flag = true)
     ),
     r AS (
       SELECT 'risk' AS kind, status::text AS status, target_mitigation_date::text AS deadline, NULL::timestamptz AS created_at, impact_level::text AS impact_level
       FROM risks
       WHERE dashboard_id IN (SELECT id FROM children) AND is_archived = false
         AND (dashboard_id = $1 OR publish_flag = true)
     ),
     dec AS (
       SELECT 'decision' AS kind, status::text AS status, decision_deadline::text AS deadline, NULL::timestamptz AS created_at, NULL::text AS impact_level
       FROM decisions
       WHERE dashboard_id IN (SELECT id FROM children) AND is_archived = false
         AND (dashboard_id = $1 OR publish_flag = true)
     )
     SELECT * FROM t UNION ALL SELECT * FROM r UNION ALL SELECT * FROM dec`,
    [id]
  );

  const taskRows = raw.filter((r) => r.kind === "task");
  const riskRows = raw.filter((r) => r.kind === "risk");
  const decisionRows = raw.filter((r) => r.kind === "decision");
  const now = dayjs();

  const closedStatuses = ["Closed Accepted", "Closed Pending Approval"];
  const taskStats = {
    open: taskRows.filter((t) => t.status === "Open").length,
    inProgress: taskRows.filter((t) => t.status === "In Progress").length,
    overdue: taskRows.filter((t) => !closedStatuses.includes(t.status) && t.deadline && now.isAfter(dayjs(t.deadline))).length,
    pendingApproval: taskRows.filter((t) => t.status === "Closed Pending Approval").length
  };
  const riskStats = {
    totalActive: riskRows.filter((r) => r.status !== "Closed").length,
    red: riskRows.filter((r) => r.impact_level === "Critical").length,
    overdueMitigations: riskRows.filter((r) => r.status !== "Closed" && r.deadline && now.isAfter(dayjs(r.deadline))).length
  };
  const decisionStats = {
    pending: decisionRows.filter((d) => d.status === "Pending").length,
    overdue: decisionRows.filter((d) => d.status === "Pending" && d.deadline && now.isAfter(dayjs(d.deadline))).length
  };

  const totalItems = taskStats.open + taskStats.inProgress + riskStats.totalActive + decisionStats.pending;
  const overdueCount = taskStats.overdue + riskStats.overdueMitigations + decisionStats.overdue;
  const agingTasks = taskRows.filter((t) => now.diff(dayjs(t.created_at), "day") > 20).length;
  const riskFactor = riskStats.red + overdueCount + agingTasks;
  const healthScore = totalItems === 0 ? 100 : Math.max(0, 100 - Math.round((riskFactor / totalItems) * 100));

  res.json({ taskStats, riskStats, decisionStats, healthScore });
});

// ── Access management ──────────────────────────────────────────

router.post("/:id/access", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const isOwner = await isDashboardOwner(userId, id);
  const role = await getUserRole(userId);
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Not allowed" });
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
  if (!isOwner && !isAdminRole(role)) return res.status(403).json({ error: "Owners only" });

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
