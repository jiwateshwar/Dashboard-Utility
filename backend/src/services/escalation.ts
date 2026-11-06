import dayjs from "dayjs";
import { v4 as uuid } from "uuid";
import { query } from "../db.js";
import { CLOSED_TASK_STATUSES } from "../constants.js";
import { notifyUser } from "./notifying.js";

// In-app only (type "escalation" isn't routed to email) — the daily digest
// emails each user the escalations raised for them that morning.
async function notify(userId: string, dashboardId: string, entityType: string, entityId: string, ruleName: string, message: string) {
  const id = uuid();
  await query(
    `INSERT INTO escalations (id, dashboard_id, entity_type, entity_id, rule_name, message, notified_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, dashboardId, entityType, entityId, ruleName, message, userId]
  );
  await notifyUser({ userId, message, type: "escalation", entityType, entityId, dashboardId });
}

const taskLabel = (t: any) => `"${t.title || t.item_details}"`;

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

async function runDefaultRules(
  dash: { id: string; primary_owner_id: string },
  userMap: Map<string, { manager_id: string | null }>
) {
  const tasks = await query(
    `SELECT t.id, t.owner_id, t.created_at, t.title, t.item_details
     FROM tasks t
     WHERE t.dashboard_id = $1 AND t.is_archived = false AND NOT (t.status::text = ANY($2))`,
    [dash.id, CLOSED_TASK_STATUSES]
  );
  for (const task of tasks.rows) {
    const ageDays = dayjs().diff(dayjs(task.created_at), "day");
    if (ageDays > 20) {
      const managerId = userMap.get(task.owner_id)?.manager_id;
      if (managerId) {
        await notify(managerId, dash.id, "Task", task.id, "Task aging > 20 days", `Task ${taskLabel(task)} has been open ${ageDays} days`);
      }
    }
  }

  const risks = await query(
    `SELECT id, impact_level, risk_title FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
    [dash.id]
  );
  for (const risk of risks.rows) {
    if (risk.impact_level === "Critical") {
      await notify(dash.primary_owner_id, dash.id, "Risk", risk.id, "Critical risk", `Risk "${risk.risk_title}" is Critical`);
    }
  }

  const decisions = await query(
    `SELECT id, decision_deadline, decision_title FROM decisions WHERE dashboard_id = $1 AND status = 'Pending' AND is_archived = false`,
    [dash.id]
  );
  for (const decision of decisions.rows) {
    const overdueDays = dayjs().diff(dayjs(decision.decision_deadline), "day");
    if (overdueDays > 5) {
      await notify(dash.primary_owner_id, dash.id, "Decision", decision.id, "Decision overdue > 5 days", `Decision "${decision.decision_title}" is ${overdueDays} days past its deadline`);
    }
  }
}

async function runRule(
  dash: { id: string; primary_owner_id: string },
  rule: Rule,
  userMap: Map<string, { manager_id: string | null }>
) {
  const condition = rule.condition_json || {};
  if (condition.type === "task_aging_gt") {
    const days = Number(condition.days || 0);
    const notifyTarget = condition.notify || "manager";
    const tasks = await query(
      `SELECT t.id, t.owner_id, t.created_at, t.title, t.item_details
       FROM tasks t
       WHERE t.dashboard_id = $1 AND t.is_archived = false AND NOT (t.status::text = ANY($2))`,
      [dash.id, CLOSED_TASK_STATUSES]
    );
    for (const task of tasks.rows) {
      const ageDays = dayjs().diff(dayjs(task.created_at), "day");
      if (ageDays > days) {
        let notifyUser = dash.primary_owner_id;
        if (notifyTarget === "manager") {
          notifyUser = userMap.get(task.owner_id)?.manager_id || dash.primary_owner_id;
        }
        await notify(notifyUser, dash.id, "Task", task.id, rule.rule_name, `Task ${taskLabel(task)} has been open ${ageDays} days`);
      }
    }
  }

  if (condition.type === "critical_risk") {
    const risks = await query(
      `SELECT id, impact_level, risk_title FROM risks WHERE dashboard_id = $1 AND is_archived = false`,
      [dash.id]
    );
    for (const risk of risks.rows) {
      if (risk.impact_level === "Critical") {
        await notify(dash.primary_owner_id, dash.id, "Risk", risk.id, rule.rule_name, `Risk "${risk.risk_title}" is Critical`);
      }
    }
  }

  if (condition.type === "decision_overdue_gt") {
    const days = Number(condition.days || 0);
    const decisions = await query(
      `SELECT id, decision_deadline, decision_title FROM decisions WHERE dashboard_id = $1 AND status = 'Pending' AND is_archived = false`,
      [dash.id]
    );
    for (const decision of decisions.rows) {
      const overdueDays = dayjs().diff(dayjs(decision.decision_deadline), "day");
      if (overdueDays > days) {
        await notify(dash.primary_owner_id, dash.id, "Decision", decision.id, rule.rule_name, `Decision "${decision.decision_title}" is ${overdueDays} days past its deadline`);
      }
    }
  }
}

export async function runEscalations() {
  const dashboards = await query(
    `SELECT id, primary_owner_id FROM dashboards WHERE is_active = true`
  );

  // Pre-fetch all users once to avoid per-task N+1 manager lookups
  const allUsers = await query(`SELECT id, manager_id FROM users`);
  const userMap = new Map<string, { manager_id: string | null }>(
    allUsers.rows.map((u) => [u.id, { manager_id: u.manager_id }])
  );

  for (const dash of dashboards.rows) {
    const rules = await loadRules(dash.id);
    if (rules.length === 0) {
      await runDefaultRules(dash as any, userMap);
      continue;
    }
    for (const rule of rules) {
      await runRule(dash as any, rule, userMap);
    }
  }
}
