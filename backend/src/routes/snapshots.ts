import { Router } from "express";
import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { buildSnapshotContent } from "../services/publishing.js";
import { buildEml } from "../services/emailSnapshot.js";
import { hasDashboardAccess, isDashboardOwner } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { dashboard_id } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const canView = (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const { rows } = await query(
    `SELECT * FROM publishing_snapshots WHERE dashboard_id = $1 ORDER BY cycle_date DESC`,
    [dashboard_id]
  );
  res.json(rows);
});

router.post("/generate", async (req, res) => {
  const { dashboard_id } = req.body as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const owner = await isDashboardOwner(userId, dashboard_id);
  if (!owner) return res.status(403).json({ error: "Owners only" });

  const content = await buildSnapshotContent(dashboard_id);
  const id = uuid();
  const today = dayjs().format("YYYY-MM-DD");
  await query(
    `INSERT INTO publishing_snapshots (id, dashboard_id, cycle_date, content_json)
     VALUES ($1, $2, $3, $4)`,
    [id, dashboard_id, today, JSON.stringify(content)]
  );

  res.json({ id });
});

router.get("/email/:dashboardId", async (req, res) => {
  const { dashboardId } = req.params;
  const userId = req.session.userId!;
  const canView = (await hasDashboardAccess(userId, dashboardId)) || (await isDashboardOwner(userId, dashboardId));
  if (!canView) return res.status(403).json({ error: "No access" });

  const dash = await query(`SELECT name FROM dashboards WHERE id = $1`, [dashboardId]);
  const dashboardName = dash.rows[0]?.name || "Dashboard";

  const { rows } = await query(
    `SELECT content_json, cycle_date FROM publishing_snapshots
     WHERE dashboard_id = $1 ORDER BY cycle_date DESC LIMIT 1`,
    [dashboardId]
  );

  const content = rows[0]?.content_json || (await buildSnapshotContent(dashboardId));
  const date = rows[0]?.cycle_date || dayjs().format("YYYY-MM-DD");
  const eml = buildEml({ dashboardName, date, content });

  const filename = `PRISM_${dashboardName.replace(/\s+/g, "_")}_${dayjs(date).format("YYYYMMDD")}.eml`;
  res.setHeader("Content-Type", "message/rfc822");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.send(eml);
});

export default router;
