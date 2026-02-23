import { query } from "../db.js";

export async function runArchival() {
  await query(
    `UPDATE tasks
     SET is_archived = true
     WHERE status = 'Closed Accepted'
       AND closure_approved_at IS NOT NULL
       AND closure_approved_at < now() - interval '45 days'`
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
