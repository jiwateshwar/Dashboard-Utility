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
  if (role === "Admin") return true;
  if (!dashboardId) return false;
  return isDashboardOwner(userId, dashboardId);
}
