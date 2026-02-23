import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { entity_type, entity_id, dashboard_id } = req.query as any;

  const { rows } = await query(
    `SELECT a.*
     FROM audit_log a
     WHERE ($1::text IS NULL OR a.entity_type = $1)
       AND ($2::uuid IS NULL OR a.entity_id = $2)
       AND (
         $3::uuid IS NULL OR
         EXISTS (SELECT 1 FROM tasks t WHERE a.entity_type = 'Task' AND t.id = a.entity_id AND t.dashboard_id = $3) OR
         EXISTS (SELECT 1 FROM risks r WHERE a.entity_type = 'Risk' AND r.id = a.entity_id AND r.dashboard_id = $3) OR
         EXISTS (SELECT 1 FROM decisions d WHERE a.entity_type = 'Decision' AND d.id = a.entity_id AND d.dashboard_id = $3)
       )
     ORDER BY a.timestamp DESC
     LIMIT 500`,
    [entity_type || null, entity_id || null, dashboard_id || null]
  );

  res.json(rows);
});

export default router;
