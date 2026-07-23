import { query } from "../db.js";
import { CLOSED_TASK_STATUSES } from "../constants.js";
import { notifyUser } from "./notifying.js";

/** Runs daily — reminds every owner of an overdue, still-open task. Recurring by design: fires again each day the task remains overdue. */
export async function notifyOverdueTasks() {
  const { rows } = await query(
    `SELECT t.id, t.dashboard_id, t.title, t.item_details, t.target_date, d.name as dashboard_name,
            COALESCE(
              (SELECT array_agg(tow.user_id) FROM task_owners tow WHERE tow.task_id = t.id),
              ARRAY[t.owner_id]
            ) as owner_ids
     FROM tasks t
     JOIN dashboards d ON d.id = t.dashboard_id
     WHERE t.is_archived = false
       AND t.status != 'Closed Pending Approval'
       AND NOT (t.status::text = ANY($1))
       AND t.target_date < CURRENT_DATE`,
    [CLOSED_TASK_STATUSES]
  );

  for (const t of rows) {
    const label = t.title || t.item_details;
    for (const ownerId of t.owner_ids as string[]) {
      await notifyUser({
        userId: ownerId,
        message: `Overdue: "${label}" was due ${new Date(t.target_date).toISOString().slice(0, 10)} in ${t.dashboard_name}`,
        type: "task_overdue",
        entityType: "Task",
        entityId: t.id,
        dashboardId: t.dashboard_id
      });
    }
  }
}
