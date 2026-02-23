import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getSubordinateIds } from "../services/hierarchy.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const subordinates = await getSubordinateIds(userId);
  if (subordinates.length === 0) return res.json({ tasks: [], risks: [], decisions: [] });

  const tasks = await query(
    `SELECT * FROM tasks WHERE is_archived = false AND owner_id = ANY($1)`,
    [subordinates]
  );
  const risks = await query(
    `SELECT * FROM risks WHERE is_archived = false AND risk_owner = ANY($1)`,
    [subordinates]
  );
  const decisions = await query(
    `SELECT * FROM decisions WHERE is_archived = false AND decision_owner = ANY($1)`,
    [subordinates]
  );

  res.json({ tasks: tasks.rows, risks: risks.rows, decisions: decisions.rows });
});

export default router;
