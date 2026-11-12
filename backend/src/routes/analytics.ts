import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getUserRole, hasDashboardAccess, isAdminRole, isDashboardOwner } from "../services/permission.js";
import { visitsByDashboard, weekStart, weeklyVisits, sendDashboardVisitorReports } from "../services/analytics.js";
import { processOutbox } from "../services/mailer.js";

const router = Router();
router.use(requireAuth);

// Weekly unique visitors for one dashboard (anyone who can view the dashboard).
router.get("/dashboards/:id", async (req, res) => {
  const userId = req.session.userId!;
  const { id } = req.params;
  const role = await getUserRole(userId);
  const canView = isAdminRole(role) || (await isDashboardOwner(userId, id)) || (await hasDashboardAccess(userId, id));
  if (!canView) return res.status(403).json({ error: "No access" });
  const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 1), 52);
  res.json({ weeks: await weeklyVisits(id, weeks) });
});

// All dashboards, this week so far and last week (admins).
router.get("/overview", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const [thisWeek, lastWeek] = await Promise.all([visitsByDashboard(weekStart(0)), visitsByDashboard(weekStart(1))]);
  const last = new Map(lastWeek.map((r) => [r.dashboard_id, r]));
  res.json({
    this_week_start: weekStart(0),
    last_week_start: weekStart(1),
    dashboards: thisWeek.map((r) => ({
      dashboard_id: r.dashboard_id,
      name: r.name,
      subscribers: r.subscribers,
      this_week_unique: r.unique_visitors,
      this_week_views: r.views,
      last_week_unique: last.get(r.dashboard_id)?.unique_visitors ?? 0,
      last_week_views: last.get(r.dashboard_id)?.views ?? 0
    }))
  });
});

// SuperAdmin: send yourself last week's visitor report now, to preview it.
router.post("/preview-report", async (req, res) => {
  const userId = req.session.userId!;
  if ((await getUserRole(userId)) !== "SuperAdmin") return res.status(403).json({ error: "SuperAdmin only" });
  const sent = await sendDashboardVisitorReports({ onlyUserId: userId, force: true });
  void processOutbox();
  res.json({ ok: true, sent, message: sent ? "Queued — it should arrive within a minute." : "Nothing to send: you aren't subscribed to any active dashboard, or email is off." });
});

export default router;
