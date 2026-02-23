import dayjs from "dayjs";
import { query } from "../db.js";

export async function buildSnapshotContent(dashboardId: string) {
  const tasks = await query(
    `SELECT t.*, u.name as owner_name
     FROM tasks t
     JOIN users u ON u.id = t.owner_id
     WHERE t.dashboard_id = $1 AND t.publish_flag = true AND t.is_archived = false`,
    [dashboardId]
  );

  const risks = await query(
    `SELECT r.*, u.name as owner_name
     FROM risks r
     JOIN users u ON u.id = r.risk_owner
     WHERE r.dashboard_id = $1 AND r.publish_flag = true AND r.is_archived = false`,
    [dashboardId]
  );

  const decisions = await query(
    `SELECT d.*, u.name as owner_name
     FROM decisions d
     JOIN users u ON u.id = d.decision_owner
     WHERE d.dashboard_id = $1 AND d.publish_flag = true AND d.is_archived = false`,
    [dashboardId]
  );

  const closedTasks = await query(
    `SELECT t.*, u.name as owner_name
     FROM tasks t
     JOIN users u ON u.id = t.owner_id
     WHERE t.dashboard_id = $1
       AND t.status = 'Closed Accepted'
       AND t.closure_approved_at >= now() - interval '45 days'`,
    [dashboardId]
  );

  const closedRisks = await query(
    `SELECT r.*, u.name as owner_name
     FROM risks r
     JOIN users u ON u.id = r.risk_owner
     WHERE r.dashboard_id = $1
       AND r.status = 'Closed'
       AND r.closed_at >= now() - interval '45 days'`,
    [dashboardId]
  );

  const closedDecisions = await query(
    `SELECT d.*, u.name as owner_name
     FROM decisions d
     JOIN users u ON u.id = d.decision_owner
     WHERE d.dashboard_id = $1
       AND d.status = 'Approved'
       AND d.decision_date >= now() - interval '45 days'`,
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
    openTasks: tasks.rows.filter((t) => t.status === "Open" || t.status === "In Progress"),
    closedTasks: closedTasks.rows,
    closedRisks: closedRisks.rows,
    closedDecisions: closedDecisions.rows
  };
}
