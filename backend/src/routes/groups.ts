import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isAdminRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const { rows } = await query(`SELECT * FROM groups ORDER BY name`);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { name, description } = req.body as any;
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uuid();
  await query(
    `INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)`,
    [id, name, description || null]
  );
  res.json({ id });
});

router.post("/assign", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { dashboard_id, group_id } = req.body as any;
  if (!dashboard_id || !group_id) return res.status(400).json({ error: "Missing fields" });
  await query(
    `INSERT INTO dashboard_groups (dashboard_id, group_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [dashboard_id, group_id]
  );
  res.json({ ok: true });
});

// Get all dashboards with in_group flag for a specific group
router.get("/:id/dashboards", async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT d.id, d.name, d.description,
       EXISTS(SELECT 1 FROM dashboard_groups WHERE dashboard_id = d.id AND group_id = $1) AS in_group
     FROM dashboards d
     ORDER BY d.name`,
    [id]
  );
  res.json(rows);
});

// Add one or more dashboards to a group
router.post("/:id/dashboards", async (req, res) => {
  const { id } = req.params;
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });

  const { dashboard_ids } = req.body as any;
  if (!Array.isArray(dashboard_ids) || dashboard_ids.length === 0) {
    return res.status(400).json({ error: "dashboard_ids required" });
  }

  for (const dashboardId of dashboard_ids) {
    await query(
      `INSERT INTO dashboard_groups (dashboard_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [dashboardId, id]
    );
  }
  res.json({ ok: true });
});

// Remove a dashboard from a group
router.delete("/:id/dashboards/:dashboardId", async (req, res) => {
  const { id, dashboardId } = req.params;
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });

  await query(
    `DELETE FROM dashboard_groups WHERE group_id = $1 AND dashboard_id = $2`,
    [id, dashboardId]
  );
  res.json({ ok: true });
});

export default router;
