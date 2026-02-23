import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { hasDashboardAccess, isDashboardOwner } from "../services/permission.js";
const router = Router();
router.use(requireAuth);
router.get("/", async (req, res) => {
    const userId = req.session.userId;
    const { q, dashboard_id, status, rag, aging_gt } = req.query;
    if (!q)
        return res.status(400).json({ error: "q required" });
    const subordinates = await getSubordinateIds(userId);
    if (dashboard_id) {
        const canView = (await hasDashboardAccess(userId, dashboard_id)) || (await isDashboardOwner(userId, dashboard_id));
        if (!canView)
            return res.status(403).json({ error: "No access" });
    }
    const tasks = await query(`SELECT id, item_details as title, 'Task' as type, dashboard_id
     FROM tasks
     WHERE is_archived = false
       AND ($2::uuid IS NULL OR dashboard_id = $2)
       AND (publish_flag = true OR owner_id = $3 OR created_by = $3 OR owner_id = ANY($4) OR created_by = ANY($4))
       AND (item_details ILIKE '%' || $1 || '%')
       AND ($5::text IS NULL OR status = $5)
       AND ($6::text IS NULL OR rag_status = $6)
       AND ($7::int IS NULL OR date_part('day', now() - created_at) > $7)`, [q, dashboard_id || null, userId, subordinates, status || null, rag || null, aging_gt ? Number(aging_gt) : null]);
    const risks = await query(`SELECT id, risk_title as title, 'Risk' as type, dashboard_id
     FROM risks
     WHERE is_archived = false
       AND ($2::uuid IS NULL OR dashboard_id = $2)
       AND (publish_flag = true OR risk_owner = $3 OR risk_owner = ANY($4))
       AND (risk_title ILIKE '%' || $1 || '%' OR risk_description ILIKE '%' || $1 || '%')
       AND ($5::text IS NULL OR status = $5)`, [q, dashboard_id || null, userId, subordinates, status || null]);
    const decisions = await query(`SELECT id, decision_title as title, 'Decision' as type, dashboard_id
     FROM decisions
     WHERE is_archived = false
       AND ($2::uuid IS NULL OR dashboard_id = $2)
       AND (publish_flag = true OR decision_owner = $3 OR created_by = $3 OR decision_owner = ANY($4) OR created_by = ANY($4))
       AND (decision_title ILIKE '%' || $1 || '%' OR decision_context ILIKE '%' || $1 || '%')
       AND ($5::text IS NULL OR status = $5)`, [q, dashboard_id || null, userId, subordinates, status || null]);
    const accounts = await query(`SELECT id, account_name as title, 'Account' as type, NULL::uuid as dashboard_id
     FROM accounts
     WHERE account_name ILIKE '%' || $1 || '%'`, [q]);
    res.json({
        tasks: tasks.rows,
        risks: risks.rows,
        decisions: decisions.rows,
        accounts: accounts.rows
    });
});
export default router;
