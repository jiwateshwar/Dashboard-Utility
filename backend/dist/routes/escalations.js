import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isDashboardOwner } from "../services/permission.js";
const router = Router();
router.use(requireAuth);
async function requireOwnerOrAdmin(userId, dashboardId) {
    const role = await getUserRole(userId);
    if (role === "Admin")
        return true;
    return isDashboardOwner(userId, dashboardId);
}
router.get("/rules", async (req, res) => {
    const { dashboard_id } = req.query;
    if (!dashboard_id)
        return res.status(400).json({ error: "dashboard_id required" });
    const ok = await requireOwnerOrAdmin(req.session.userId, dashboard_id);
    if (!ok)
        return res.status(403).json({ error: "Not allowed" });
    const { rows } = await query(`SELECT * FROM escalation_rules WHERE dashboard_id = $1 ORDER BY created_at DESC`, [dashboard_id]);
    res.json(rows);
});
router.post("/rules", async (req, res) => {
    const { dashboard_id, entity_type, rule_name, condition_json, is_active } = req.body;
    if (!dashboard_id || !entity_type || !rule_name || !condition_json) {
        return res.status(400).json({ error: "Missing fields" });
    }
    const ok = await requireOwnerOrAdmin(req.session.userId, dashboard_id);
    if (!ok)
        return res.status(403).json({ error: "Not allowed" });
    const id = uuid();
    await query(`INSERT INTO escalation_rules (id, dashboard_id, entity_type, rule_name, condition_json, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`, [id, dashboard_id, entity_type, rule_name, JSON.stringify(condition_json), is_active ?? true]);
    res.json({ id });
});
router.patch("/rules/:id", async (req, res) => {
    const { id } = req.params;
    const rule = await query(`SELECT dashboard_id FROM escalation_rules WHERE id = $1`, [id]);
    if (rule.rows.length === 0)
        return res.status(404).json({ error: "Not found" });
    const dashboardId = rule.rows[0].dashboard_id;
    const ok = await requireOwnerOrAdmin(req.session.userId, dashboardId);
    if (!ok)
        return res.status(403).json({ error: "Not allowed" });
    const { rule_name, condition_json, is_active } = req.body;
    await query(`UPDATE escalation_rules
     SET rule_name = COALESCE($2, rule_name),
         condition_json = COALESCE($3, condition_json),
         is_active = COALESCE($4, is_active)
     WHERE id = $1`, [id, rule_name || null, condition_json ? JSON.stringify(condition_json) : null, is_active]);
    res.json({ ok: true });
});
router.get("/logs", async (req, res) => {
    const { dashboard_id } = req.query;
    if (!dashboard_id)
        return res.status(400).json({ error: "dashboard_id required" });
    const ok = await requireOwnerOrAdmin(req.session.userId, dashboard_id);
    if (!ok)
        return res.status(403).json({ error: "Not allowed" });
    const { rows } = await query(`SELECT * FROM escalations WHERE dashboard_id = $1 ORDER BY created_at DESC LIMIT 500`, [dashboard_id]);
    res.json(rows);
});
export default router;
