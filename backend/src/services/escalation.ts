import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { query } from "../db.js";

async function notify(userId: string, dashboardId: string, entityType: string, entityId: string, ruleName: string, message: string) {
  const id = uuid();
  await query(
    `INSERT INTO escalations (id, dashboard_id, entity_type, entity_id, rule_name, message, notified_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, dashboardId, entityType, entityId, ruleName, message, userId]
  );
  await query(
    `INSERT INTO notifications (id, user_id, message)
     VALUES ($1, $2, $3)`,
    [uuid(), userId, message]
  );
}

export async function runEscalations() {
  // Default rules when no custom rules are configured.
  const dashboards = await query(
    `SELECT id, primary_owner_id FROM dashboards WHERE is_active = true`
  );

  for (const dash of dashboards.rows) {
    // Task aging > 20 days -> notify manager
    const tasks = await query(
      `SELECT t.id, t.owner_id, t.created_at
       FROM tasks t
       WHERE t.dashboard_id = $1 AND t.is_archived = false AND t.status != 'Closed Accepted'`,
      [dash.id]
    );
    for (const task of tasks.rows) {
      const ageDays = dayjs().diff(dayjs(task.created_at), "day");
      if (ageDays > 20) {
        const manager = await query(
          `SELECT manager_id FROM users WHERE id = $1`,
          [task.owner_id]
        );
        const managerId = manager.rows[0]?.manager_id;
        if (managerId) {
          await notify(managerId, dash.id, "Task", task.id, "Task aging > 20 days", `Task ${task.id} aging ${ageDays} days`);
        }
      }
    }

    // Critical risk -> notify primary owner
    const risks = await query(
      `SELECT id, impact_level FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
      [dash.id]
    );
    for (const risk of risks.rows) {
      if (risk.impact_level === "Critical") {
        await notify(dash.primary_owner_id, dash.id, "Risk", risk.id, "Critical risk", `Risk ${risk.id} is Critical`);
      }
    }

    // Decision overdue > 5 days -> notify primary owner
    const decisions = await query(
      `SELECT id, decision_deadline FROM decisions WHERE dashboard_id = $1 AND status = 'Pending' AND is_archived = false`,
      [dash.id]
    );
    for (const decision of decisions.rows) {
      const overdueDays = dayjs().diff(dayjs(decision.decision_deadline), "day");
      if (overdueDays > 5) {
        await notify(dash.primary_owner_id, dash.id, "Decision", decision.id, "Decision overdue > 5 days", `Decision ${decision.id} overdue ${overdueDays} days`);
      }
    }
  }
}
