import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
const router = Router();
router.use(requireAuth);
router.get("/", async (req, res) => {
    const userId = req.session.userId;
    const tasks = await query(`SELECT * FROM tasks WHERE is_archived = false AND (owner_id = $1 OR created_by = $1)`, [userId]);
    const risks = await query(`SELECT * FROM risks WHERE is_archived = false AND risk_owner = $1`, [userId]);
    const decisions = await query(`SELECT * FROM decisions WHERE is_archived = false AND (decision_owner = $1 OR created_by = $1)`, [userId]);
    const escalations = await query(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    const pendingApprovals = await query(`SELECT t.* FROM tasks t
     WHERE t.status = 'Closed Pending Approval'
       AND (t.created_by = $1 OR t.created_by IN (SELECT id FROM users WHERE manager_id = $1))`, [userId]);
    res.json({
        tasks: tasks.rows,
        risks: risks.rows,
        decisions: decisions.rows,
        escalations: escalations.rows,
        pendingApprovals: pendingApprovals.rows
    });
});
export default router;
