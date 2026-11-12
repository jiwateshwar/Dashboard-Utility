import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getSubordinateIds } from "../services/hierarchy.js";
import { pendingApprovalsFor } from "../services/approvals.js";
import { listDecisions, listRisks, listTasks } from "../services/workItems.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const subordinates = await getSubordinateIds(userId);
  if (subordinates.length === 0) {
    return res.json({ tasks: [], risks: [], decisions: [], pendingApprovals: [] });
  }

  const [tasks, risks, decisions, pendingApprovals] = await Promise.all([
    // Tasks any of my (direct or indirect) reports owns, as main or co-owner.
    listTasks(`t.owner_id = ANY($1::uuid[]) OR EXISTS (SELECT 1 FROM task_owners o WHERE o.task_id = t.id AND o.user_id = ANY($1::uuid[]))`, [subordinates]),
    listRisks(`r.risk_owner = ANY($1::uuid[])`, [subordinates]),
    listDecisions(`dc.decision_owner = ANY($1::uuid[])`, [subordinates]),
    // My team's closure requests, whoever has to approve them (shown read-only unless I'm the approver).
    pendingApprovalsFor(userId, "t.owner_id = ANY($2::uuid[])", [subordinates])
  ]);

  res.json({ tasks, risks, decisions, pendingApprovals });
});

export default router;
