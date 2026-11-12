import { query } from "../db.js";
import { logAudit } from "./auditing.js";
import { notifyUsers } from "./notifying.js";

/** A closure request waiting this long without approval is accepted automatically. */
export const AUTO_CLOSE_AFTER_DAYS = 21;

/**
 * Accepts closure of tasks that have sat in "Closed Pending Approval" for
 * three weeks without the creator approving. The wait is measured from
 * closure_requested_at; tasks moved to pending before that column was set
 * reliably fall back to updated_at. Returns how many tasks were closed.
 */
export async function autoCloseStaleClosureRequests(): Promise<number> {
  const { rows } = await query(
    `UPDATE tasks t
     SET status = 'Closed Accepted',
         closure_approved_at = now(),
         closure_approved_by = NULL,
         updated_at = now()
     FROM dashboards d
     WHERE d.id = t.dashboard_id
       AND t.status = 'Closed Pending Approval'
       AND COALESCE(t.closure_requested_at, t.updated_at) <= now() - make_interval(days => $1)
     RETURNING t.id, t.dashboard_id, t.created_by, COALESCE(t.title, t.item_details) AS label,
               d.name AS dashboard_name, t.closure_requested_at`,
    [AUTO_CLOSE_AFTER_DAYS]
  );

  for (const t of rows) {
    const owners = await query(`SELECT user_id FROM task_owners WHERE task_id = $1`, [t.id]);
    const recipients = [t.created_by, ...owners.rows.map((r: any) => r.user_id)];
    // No actor: a system action, so nobody is skipped as "the actor".
    await notifyUsers(recipients, {
      message: `"${t.label}" in ${t.dashboard_name} was closed automatically: its closure request had no approval for ${AUTO_CLOSE_AFTER_DAYS} days.`,
      type: "task_closure_auto_approved",
      entityType: "Task",
      entityId: t.id,
      dashboardId: t.dashboard_id
    });
    await logAudit({
      entityType: "Task",
      entityId: t.id,
      // audit_log.changed_by is NOT NULL; record it against the creator whose approval lapsed.
      changedBy: t.created_by,
      oldValue: { status: "Closed Pending Approval", closure_requested_at: t.closure_requested_at },
      newValue: { status: "Closed Accepted", by: "system", reason: `Auto-accepted after ${AUTO_CLOSE_AFTER_DAYS} days without approval` }
    });
  }
  if (rows.length > 0) console.log(`[autoClose] accepted ${rows.length} stale closure request(s)`);
  return rows.length;
}
