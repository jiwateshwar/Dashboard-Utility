import { query } from "../db.js";

export async function getUserRole(userId: string) {
  const { rows } = await query(
    `SELECT role FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.role || "User";
}

export function isAdminRole(role: string) {
  return role === "Admin" || role === "SuperAdmin";
}

export async function isDashboardOwner(userId: string, dashboardId: string) {
  const { rows } = await query(
    `SELECT 1 FROM dashboard_owners WHERE dashboard_id = $1 AND user_id = $2
     UNION
     SELECT 1 FROM dashboards WHERE id = $1 AND (primary_owner_id = $2 OR secondary_owner_id = $2)`,
    [dashboardId, userId]
  );
  return rows.length > 0;
}

export async function hasDashboardAccess(userId: string, dashboardId: string) {
  const { rows } = await query(
    `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_view = true`,
    [dashboardId, userId]
  );
  return rows.length > 0;
}

export async function canEditDashboard(userId: string, dashboardId: string) {
  const role = await getUserRole(userId);
  if (isAdminRole(role)) return true;
  const { rows } = await query(
    `SELECT 1 FROM dashboard_access WHERE dashboard_id = $1 AND user_id = $2 AND can_edit = true`,
    [dashboardId, userId]
  );
  return rows.length > 0 || (await isDashboardOwner(userId, dashboardId));
}

export async function canManageAccounts(userId: string, dashboardId?: string) {
  const role = await getUserRole(userId);
  if (isAdminRole(role)) return true;
  if (!dashboardId) return false;
  return isDashboardOwner(userId, dashboardId);
}

export async function isLinkOwner(userId: string, linkId: string) {
  const { rows } = await query(
    `SELECT 1 FROM links WHERE id = $1 AND owner_id = $2`,
    [linkId, userId]
  );
  return rows.length > 0;
}

export async function hasLinkAccess(userId: string, linkId: string) {
  const { rows } = await query(
    `SELECT 1 FROM links l WHERE l.id = $1 AND (
       l.owner_id = $2
       OR EXISTS(
         SELECT 1 FROM link_teams lt
         JOIN team_members tm ON tm.team_id = lt.team_id
         WHERE lt.link_id = l.id AND tm.user_id = $2
       )
     )`,
    [linkId, userId]
  );
  return rows.length > 0;
}
