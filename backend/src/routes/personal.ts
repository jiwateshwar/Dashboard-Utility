import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { pendingApprovalsFor } from "../services/approvals.js";
import { listDecisions, listRisks, listTasks } from "../services/workItems.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const [tasks, risks, decisions, pendingApprovals] = await Promise.all([
    // Tasks I own (main or co-owner) or created.
    listTasks(`t.owner_id = $1 OR t.created_by = $1 OR EXISTS (SELECT 1 FROM task_owners o WHERE o.task_id = t.id AND o.user_id = $1)`, [userId]),
    listRisks(`r.risk_owner = $1`, [userId]),
    listDecisions(`dc.decision_owner = $1 OR dc.created_by = $1`, [userId]),
    // Only closures waiting on *me*: tasks I created (approval is the creator's call).
    pendingApprovalsFor(userId, "t.created_by = $1", [])
  ]);
  res.json({ tasks, risks, decisions, pendingApprovals });
});

export default router;
