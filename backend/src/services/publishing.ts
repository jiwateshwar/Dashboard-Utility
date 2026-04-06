import dayjs from "dayjs";
import { query } from "../db.js";

export async function buildSnapshotContent(dashboardId: string, publishedOnly = false) {
  // Recursive CTE: include child dashboards up to 2 levels deep.
  // When publishedOnly=false: all non-archived items from root and children are included.
  // When publishedOnly=true: only items with publish_flag=true (root and children alike).
  const pf  = publishedOnly ? "AND t.publish_flag = true" : "";
  const pfR = publishedOnly ? "AND r.publish_flag = true" : "";
  const pfD = publishedOnly ? "AND d.publish_flag = true" : "";

  const tasks = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT t.*, u.name as owner_name, cat.name as category_name, a.account_name
     FROM tasks t
     JOIN child_dashboards cd ON t.dashboard_id = cd.id
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN categories cat ON cat.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.is_archived = false ${pf}
     ORDER BY cd.depth, cat.name NULLS LAST, t.created_at`,
    [dashboardId]
  );

  const risks = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT r.*, u.name as owner_name, a.account_name
     FROM risks r
     JOIN child_dashboards cd ON r.dashboard_id = cd.id
     JOIN users u ON u.id = r.risk_owner
     LEFT JOIN accounts a ON a.id = r.account_id
     WHERE r.is_archived = false ${pfR}
     ORDER BY cd.depth, r.impact_level DESC, r.created_at`,
    [dashboardId]
  );

  const decisions = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT d.*, u.name as owner_name, a.account_name
     FROM decisions d
     JOIN child_dashboards cd ON d.dashboard_id = cd.id
     JOIN users u ON u.id = d.decision_owner
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.is_archived = false ${pfD}
     ORDER BY cd.depth, d.decision_deadline`,
    [dashboardId]
  );

  const closedTasks = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT t.*, u.name as owner_name, cat.name as category_name, a.account_name
     FROM tasks t
     JOIN child_dashboards cd ON t.dashboard_id = cd.id
     JOIN users u ON u.id = t.owner_id
     LEFT JOIN categories cat ON cat.id = t.category_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE t.status = 'Closed Accepted'
       AND t.closure_approved_at >= now() - interval '45 days'
       ${pf}`,
    [dashboardId]
  );

  const closedRisks = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT r.*, u.name as owner_name, a.account_name
     FROM risks r
     JOIN child_dashboards cd ON r.dashboard_id = cd.id
     JOIN users u ON u.id = r.risk_owner
     LEFT JOIN accounts a ON a.id = r.account_id
     WHERE r.status = 'Closed'
       AND r.closed_at >= now() - interval '45 days'
       ${pfR}`,
    [dashboardId]
  );

  const closedDecisions = await query(
    `WITH RECURSIVE child_dashboards AS (
       SELECT id, 0 AS depth FROM dashboards WHERE id = $1
       UNION ALL
       SELECT dsh.id, c.depth + 1
       FROM dashboards dsh JOIN child_dashboards c ON dsh.parent_dashboard_id = c.id
       WHERE c.depth < 2
     )
     SELECT d.*, u.name as owner_name, a.account_name
     FROM decisions d
     JOIN child_dashboards cd ON d.dashboard_id = cd.id
     JOIN users u ON u.id = d.decision_owner
     LEFT JOIN accounts a ON a.id = d.account_id
     WHERE d.status = 'Approved'
       AND d.decision_date >= now() - interval '45 days'
       ${pfD}`,
    [dashboardId]
  );

  const openTaskRows = tasks.rows.filter((t) => t.status !== "Closed Accepted" && t.status !== "Closed Pending Approval");
  const summary = {
    tasks: {
      total: openTaskRows.length,
      open: openTaskRows.filter((t) => t.status === "Open").length,
      inProgress: openTaskRows.filter((t) => t.status === "In Progress").length
    },
    risks: {
      total: risks.rows.length,
      red: risks.rows.filter((r) => r.impact_level === "Critical" || r.impact_level === "High").length
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
    openTasks: openTaskRows,
    closedTasks: closedTasks.rows,
    closedRisks: closedRisks.rows,
    closedDecisions: closedDecisions.rows
  };
}
