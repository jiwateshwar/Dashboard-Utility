import { query } from "../db.js";
import { CLOSED_TASK_STATUSES } from "../constants.js";

export async function runArchival() {
  await query(
    `UPDATE tasks
     SET is_archived = true
     WHERE status::text = ANY($1)
       AND closure_approved_at IS NOT NULL
       AND closure_approved_at < now() - interval '45 days'`,
    [CLOSED_TASK_STATUSES]
  );

  await query(
    `UPDATE risks
     SET is_archived = true
     WHERE status = 'Closed'
       AND closed_at IS NOT NULL
       AND closed_at < now() - interval '45 days'`
  );

  await query(
    `UPDATE decisions
     SET is_archived = true
     WHERE status = 'Approved'
       AND decision_date IS NOT NULL
       AND decision_date < now() - interval '45 days'`
  );
}
