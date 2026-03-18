import dayjs from "dayjs";
import { query } from "../db.js";

export async function buildSnapshotContent(dashboardId: string, publishedOnly = false) {
  const pfFilter = publishedOnly ? "AND t.publish_flag = true" : "";
  const pfFilterR = publishedOnly ? "AND r.publish_flag = true" : "";
  const pfFilterD = publishedOnly ? "AND d.publish_flag = true" : "";

  const tasks = await query(
    `SELECT t.*, u.name as owner_name, c.name as category_name, a.account_name
     FROM tasks t
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.dashboard_id = $1 AND t.is_archived = false ${pfFilter}
     ORDER BY c.name NULLS LAST, t.created_at`,
    [dashboardId]
  );

  const risks = await query(
    `SELECT r.*, u.name as owner_name, a.account_name
     FROM risks r
     JOIN users u ON u.id = r.risk_owner
     LEFT JOIN accounts a ON a.id = r.account_id
     WHERE r.dashboard_id = $1 AND r.is_archived = false ${pfFilterR}
     ORDER BY r.impact_level DESC, r.created_at`,
    [dashboardId]
  );

  const decisions = await query(
    `SELECT d.*, u.name as owner_name, a.account_name
     FROM decisions d
     JOIN users u ON u.id = d.decision_owner
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.dashboard_id = $1 AND d.is_archived = false ${pfFilterD}
     ORDER BY d.decision_deadline`,
    [dashboardId]
  );

  const closedTasks = await query(
    `SELECT t.*, u.name as owner_name, c.name as category_name, a.account_name
     FROM tasks t
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.dashboard_id = $1
       AND t.status = 'Closed Accepted'
       AND t.closure_approved_at >= now() - interval '45 days'
       ${pfFilter}`,
    [dashboardId]
  );

  const closedRisks = await query(
    `SELECT r.*, u.name as owner_name, a.account_name
     FROM risks r
     JOIN users u ON u.id = r.risk_owner
     LEFT JOIN accounts a ON a.id = r.account_id
     WHERE r.dashboard_id = $1
       AND r.status = 'Closed'
       AND r.closed_at >= now() - interval '45 days'
       ${pfFilterR}`,
    [dashboardId]
  );

  const closedDecisions = await query(
    `SELECT d.*, u.name as owner_name, a.account_name
     FROM decisions d
     JOIN users u ON u.id = d.decision_owner
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.dashboard_id = $1
       AND d.status = 'Approved'
       AND d.decision_date >= now() - interval '45 days'
       ${pfFilterD}`,
    [dashboardId]
  );

  const summary = {
    tasks: {
      total: tasks.rows.length,
      open: tasks.rows.filter((t) => t.status === "Open").length,
      inProgress: tasks.rows.filter((t) => t.status === "In Progress").length
    },
    risks: {
      total: risks.rows.length,
      red: risks.rows.filter((r) => r.impact_level === "Critical" || r.risk_score >= 6).length
    },
    decisions: {
      total: decisions.rows.length,
      pending: decisions.rows.filter((d) => d.status === "Pending").length
    },
    generatedAt: dayjs().toISOString()
  };

  return {
    summary,
    tasks: tasks.rows,
    risks: risks.rows,
    decisions: decisions.rows,
    openTasks: tasks.rows.filter((t) => t.status !== "Closed Accepted" && t.status !== "Closed Pending Approval"),
    closedTasks: closedTasks.rows,
    closedRisks: closedRisks.rows,
    closedDecisions: closedDecisions.rows
  };
}
