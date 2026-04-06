import { Router } from "express";
import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { buildSnapshotContent } from "../services/publishing.js";
import { buildEml } from "../services/emailSnapshot.js";
import { getUserRole, isAdminRole, hasDashboardAccess, isDashboardOwner } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { dashboard_id } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const { rows } = await query(
    `SELECT *, expires_at < now() AS is_expired
     FROM publishing_snapshots
     WHERE dashboard_id = $1
     ORDER BY cycle_date DESC`,
    [dashboard_id]
  );
  res.json(rows);
});

router.post("/generate", async (req, res) => {
  const { dashboard_id, published_only } = req.body as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const canGenerate = isAdminRole(role) || (await isDashboardOwner(userId, dashboard_id)) || (await hasDashboardAccess(userId, dashboard_id));
  if (!canGenerate) return res.status(403).json({ error: "No access" });

  const publishedOnly = published_only === true || published_only === "true";
  const content = await buildSnapshotContent(dashboard_id, publishedOnly);
  const id = uuid();
  const today = dayjs().format("YYYY-MM-DD");
  await query(
    `INSERT INTO publishing_snapshots (id, dashboard_id, cycle_date, content_json, published_only, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '180 days')`,
    [id, dashboard_id, today, JSON.stringify(content), publishedOnly]
  );

  res.json({ id });
});

// Download email for a specific snapshot by ID
router.get("/:id/email", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;

  const snap = await query(
    `SELECT ps.*, d.name as dashboard_name, d.description as dashboard_description,
            pd.name as parent_dashboard_name
     FROM publishing_snapshots ps
     JOIN dashboards d ON d.id = ps.dashboard_id
     LEFT JOIN dashboards pd ON pd.id = d.parent_dashboard_id
     WHERE ps.id = $1`,
    [id]
  );
  if (snap.rows.length === 0) return res.status(404).json({ error: "Snapshot not found" });

  const { dashboard_id, dashboard_name, dashboard_description, parent_dashboard_name, content_json, cycle_date } = snap.rows[0];
  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const date = typeof cycle_date === "string" ? cycle_date.slice(0, 10) : dayjs(cycle_date).format("YYYY-MM-DD");
  const eml = buildEml({ dashboardName: dashboard_name, dashboardDescription: dashboard_description, parentDashboardName: parent_dashboard_name, date, content: content_json });
  const filename = `PRISM_${dashboard_name.replace(/\s+/g, "_")}_${dayjs(date).format("YYYYMMDD")}.eml`;

  res.setHeader("Content-Type", "message/rfc822");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(eml);
});

// Download email for latest snapshot of a dashboard (or generate live if none)
router.get("/email/:dashboardId", async (req, res) => {
  const { dashboardId } = req.params;
  const { preview } = req.query as any;
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await hasDashboardAccess(userId, dashboardId)) || (await isDashboardOwner(userId, dashboardId));
  if (!canView) return res.status(403).json({ error: "No access" });

  const dash = await query(
    `SELECT d.name, d.description, pd.name AS parent_dashboard_name
     FROM dashboards d LEFT JOIN dashboards pd ON pd.id = d.parent_dashboard_id
     WHERE d.id = $1`,
    [dashboardId]
  );
  const dashboardName = dash.rows[0]?.name || "Dashboard";
  const dashboardDescription = dash.rows[0]?.description;
  const parentDashboardName = dash.rows[0]?.parent_dashboard_name;

  const { rows } = await query(
    `SELECT content_json, cycle_date FROM publishing_snapshots
     WHERE dashboard_id = $1 AND expires_at > now()
     ORDER BY cycle_date DESC LIMIT 1`,
    [dashboardId]
  );

  const content = rows[0]?.content_json || (await buildSnapshotContent(dashboardId));
  const rawDate = rows[0]?.cycle_date;
  const date = rawDate
    ? (typeof rawDate === "string" ? rawDate.slice(0, 10) : dayjs(rawDate).format("YYYY-MM-DD"))
    : dayjs().format("YYYY-MM-DD");
  const eml = buildEml({ dashboardName, dashboardDescription, parentDashboardName, date, content });

  const filename = `PRISM_${dashboardName.replace(/\s+/g, "_")}_${dayjs(date).format("YYYYMMDD")}.eml`;
  if (preview === "1" || preview === "true") {
    res.setHeader("Content-Type", "text/html");
    res.send(eml.split("\n\n").slice(1).join("\n\n"));
    return;
  }

  res.setHeader("Content-Type", "message/rfc822");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(eml);
});

export default router;
