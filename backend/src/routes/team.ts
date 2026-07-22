import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const subordinates = await getSubordinateIds(userId);
  if (subordinates.length === 0) {
    return res.json({ tasks: [], risks: [], decisions: [], escalations: [], pendingApprovals: [] });
  }

  const [tasks, risks, decisions, escalations, pendingApprovals] = await Promise.all([
    query(
      `SELECT t.*,
              COALESCE(
                (SELECT array_agg(tow.user_id ORDER BY tow.user_id)
                 FROM task_owners tow WHERE tow.task_id = t.id),
                ARRAY[t.owner_id]
              ) as owner_ids,
              COALESCE(
                (SELECT array_agg(tg.tag ORDER BY tg.tag)
                 FROM task_tags tg WHERE tg.task_id = t.id),
                ARRAY[]::text[]
              ) as tags
       FROM tasks t
       WHERE t.is_archived = false AND t.owner_id = ANY($1)`,
      [subordinates]
    ),
    query(`SELECT * FROM risks WHERE is_archived = false AND risk_owner = ANY($1)`, [subordinates]),
    query(`SELECT * FROM decisions WHERE is_archived = false AND decision_owner = ANY($1)`, [subordinates]),
    query(
      `SELECT n.*, u.name as user_name FROM notifications n
       JOIN users u ON u.id = n.user_id
       WHERE n.user_id = ANY($1) ORDER BY n.created_at DESC`,
      [subordinates]
    ),
    query(
      `SELECT * FROM tasks WHERE status = 'Closed Pending Approval' AND owner_id = ANY($1)`,
      [subordinates]
    )
  ]);

  res.json({
    tasks: tasks.rows,
    risks: risks.rows,
    decisions: decisions.rows,
    escalations: escalations.rows,
    pendingApprovals: pendingApprovals.rows
  });
});

export default router;
