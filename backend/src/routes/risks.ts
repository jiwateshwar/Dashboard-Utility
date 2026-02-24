import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { getUserRole, hasDashboardAccess, isDashboardOwner, canEditDashboard } from "../services/permission.js";
import { logAudit } from "../services/auditing.js";

const router = Router();
router.use(requireAuth);

function calcRiskScore(impact: string, probability: string) {
  const impactMap: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
  const probMap: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
  return (impactMap[impact] || 1) * (probMap[probability] || 1);
}

function calcRiskRag(impact: string, probability: string) {
  if (impact === "Critical") return "Red";
  const score = calcRiskScore(impact, probability);
  if (score >= 6) return "Red";
  if (score >= 4) return "Amber";
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
    `SELECT r.*, u.name as owner_name
     FROM risks r
     JOIN users u ON u.id = r.risk_owner
     WHERE r.dashboard_id = $1
       AND ($5::boolean IS TRUE OR r.is_archived = false)
       AND (
         r.publish_flag = true OR
         r.risk_owner = $2 OR
         r.risk_owner = ANY($3) OR
         $4
       )`,
    [dashboard_id, userId, subordinates, owner, include_archived === "true"]
  );

  res.json(rows.map((r) => ({ ...r, risk_rag: calcRiskRag(r.impact_level, r.probability) })));
});

router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const {
    dashboard_id,
    account_id,
    risk_title,
    risk_description,
    risk_owner,
    impact_level,
    probability,
    mitigation_plan,
    target_mitigation_date,
    status,
    publish_flag
  } = req.body as any;

  if (!dashboard_id || !account_id || !risk_title || !risk_owner || !impact_level || !probability) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const canView = (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
  if (!canView) return res.status(403).json({ error: "No access" });

  const account = await query(`SELECT is_active FROM accounts WHERE id = $1`, [account_id]);
  if (account.rows[0]?.is_active === false) {
    return res.status(400).json({ error: "Account is deactivated" });
  }

  const id = uuid();
  const score = calcRiskScore(impact_level, probability);
  await query(
    `INSERT INTO risks
     (id, dashboard_id, account_id, risk_title, risk_description, risk_owner, impact_level, probability, risk_score, mitigation_plan, target_mitigation_date, status, publish_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [id, dashboard_id, account_id, risk_title, risk_description || null, risk_owner, impact_level, probability, score, mitigation_plan || null, target_mitigation_date || null, status || "Open", publish_flag ?? false]
  );

  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const { impact_level, probability } = req.body as any;
  const risk = await query(`SELECT dashboard_id, impact_level, probability FROM risks WHERE id = $1`, [id]);
  if (risk.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = risk.rows[0].dashboard_id as string;

  const canEdit = await canEditDashboard(userId, dashboardId);
  if (!canEdit) return res.status(403).json({ error: "No edit access" });

  const newImpact = impact_level || risk.rows[0].impact_level;
  const newProb = probability || risk.rows[0].probability;
  const newScore = calcRiskScore(newImpact, newProb);

  await query(
    `UPDATE risks
     SET risk_title = COALESCE($2, risk_title),
         risk_description = COALESCE($3, risk_description),
         risk_owner = COALESCE($4, risk_owner),
         impact_level = COALESCE($5, impact_level),
         probability = COALESCE($6, probability),
         risk_score = $7,
         mitigation_plan = COALESCE($8, mitigation_plan),
         target_mitigation_date = COALESCE($9, target_mitigation_date),
         status = COALESCE($10, status),
         publish_flag = COALESCE($11, publish_flag),
         closed_at = CASE WHEN $10 = 'Closed' THEN now() ELSE closed_at END,
         updated_at = now()
     WHERE id = $1`,
    [
      id,
      req.body.risk_title || null,
      req.body.risk_description || null,
      req.body.risk_owner || null,
      impact_level || null,
      probability || null,
      newScore,
      req.body.mitigation_plan || null,
      req.body.target_mitigation_date || null,
      req.body.status || null,
      req.body.publish_flag
    ]
  );

  await logAudit({ entityType: "Risk", entityId: id, changedBy: userId, oldValue: risk.rows[0], newValue: req.body });

  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId!;
  const risk = await query(`SELECT dashboard_id FROM risks WHERE id = $1`, [id]);
  if (risk.rows.length === 0) return res.status(404).json({ error: "Not found" });
  const dashboardId = risk.rows[0].dashboard_id as string;
  const isOwner = await isDashboardOwner(userId, dashboardId);
  const role = await getUserRole(userId);
  if (!isOwner && role !== "Admin") return res.status(403).json({ error: "Only owners can delete risks" });
  await query(`DELETE FROM risks WHERE id = $1`, [id]);
  res.json({ ok: true });
});

export default router;
