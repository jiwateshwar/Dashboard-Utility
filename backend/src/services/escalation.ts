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

type Rule = {
  id: string;
  dashboard_id: string;
  entity_type: string;
  rule_name: string;
  condition_json: any;
  is_active: boolean;
};

async function loadRules(dashboardId: string): Promise<Rule[]> {
  const { rows } = await query(
    `SELECT * FROM escalation_rules WHERE dashboard_id = $1 AND is_active = true`,
    [dashboardId]
  );
  return rows as any[];
}

async function runDefaultRules(dash: { id: string; primary_owner_id: string }) {
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

  const risks = await query(
    `SELECT id, impact_level FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
    [dash.id]
  );
  for (const risk of risks.rows) {
    if (risk.impact_level === "Critical") {
      await notify(dash.primary_owner_id, dash.id, "Risk", risk.id, "Critical risk", `Risk ${risk.id} is Critical`);
    }
  }

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

async function runRule(dash: { id: string; primary_owner_id: string }, rule: Rule) {
  const condition = rule.condition_json || {};
  if (condition.type === "task_aging_gt") {
    const days = Number(condition.days || 0);
    const notifyTarget = condition.notify || "manager";
    const tasks = await query(
      `SELECT t.id, t.owner_id, t.created_at
       FROM tasks t
       WHERE t.dashboard_id = $1 AND t.is_archived = false AND t.status != 'Closed Accepted'`,
      [dash.id]
    );
    for (const task of tasks.rows) {
      const ageDays = dayjs().diff(dayjs(task.created_at), "day");
      if (ageDays > days) {
        let notifyUser = dash.primary_owner_id;
        if (notifyTarget === "manager") {
          const manager = await query(`SELECT manager_id FROM users WHERE id = $1`, [task.owner_id]);
          notifyUser = manager.rows[0]?.manager_id || dash.primary_owner_id;
        }
        await notify(notifyUser, dash.id, "Task", task.id, rule.rule_name, `Task ${task.id} aging ${ageDays} days`);
      }
    }
  }

  if (condition.type === "critical_risk") {
    const risks = await query(
      `SELECT id, impact_level FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
      [dash.id]
    );
    for (const risk of risks.rows) {
      if (risk.impact_level === "Critical") {
        await notify(dash.primary_owner_id, dash.id, "Risk", risk.id, rule.rule_name, `Risk ${risk.id} is Critical`);
      }
    }
  }

  if (condition.type === "decision_overdue_gt") {
    const days = Number(condition.days || 0);
    const decisions = await query(
      `SELECT id, decision_deadline FROM decisions WHERE dashboard_id = $1 AND status = 'Pending' AND is_archived = false`,
      [dash.id]
    );
    for (const decision of decisions.rows) {
      const overdueDays = dayjs().diff(dayjs(decision.decision_deadline), "day");
      if (overdueDays > days) {
        await notify(dash.primary_owner_id, dash.id, "Decision", decision.id, rule.rule_name, `Decision ${decision.id} overdue ${overdueDays} days`);
      }
    }
  }
}

export async function runEscalations() {
  const dashboards = await query(
    `SELECT id, primary_owner_id FROM dashboards WHERE is_active = true`
  );

  for (const dash of dashboards.rows) {
    const rules = await loadRules(dash.id);
    if (rules.length === 0) {
      await runDefaultRules(dash as any);
      continue;
    }
    for (const rule of rules) {
      await runRule(dash as any, rule);
    }
  }
}
