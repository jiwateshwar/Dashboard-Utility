import { query } from "../db.js";
import { getUserRole, isAdminRole } from "./permission.js";
import { AUTO_CLOSE_AFTER_DAYS } from "./autoClose.js";

/**
 * Tasks waiting for closure approval, with everything the "Pending Approvals"
 * detail view needs: dashboard, account, owners, creator, when closure was
 * requested and when it will auto-close, and whether the viewer can approve.
 * `where` is an extra SQL condition on `t`, using $2.. for its params ($1 is the viewer).
 */
export async function pendingApprovalsFor(viewerId: string, where: string, params: unknown[]) {
  const { rows } = await query(
    `SELECT t.id, t.title, t.item_details, t.status, t.target_date, t.closure_requested_at,
            t.created_by, t.dashboard_id, t.account_id, t.publish_flag, t.created_at,
            d.name AS dashboard_name, a.account_name, cu.name AS created_by_name,
            COALESCE((SELECT array_agg(ou.name ORDER BY ou.name)
                      FROM task_owners o JOIN users ou ON ou.id = o.user_id WHERE o.task_id = t.id),
                     ARRAY[(SELECT name FROM users WHERE id = t.owner_id)]) AS owner_names,
            COALESCE((SELECT array_agg(tg.tag ORDER BY tg.tag) FROM task_tags tg WHERE tg.task_id = t.id), ARRAY[]::text[]) AS tags,
            COALESCE(t.closure_requested_at, t.updated_at) + make_interval(days => ${AUTO_CLOSE_AFTER_DAYS}) AS auto_close_at
     FROM tasks t
     JOIN dashboards d ON d.id = t.dashboard_id
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN users cu ON cu.id = t.created_by
     WHERE t.status = 'Closed Pending Approval' AND t.is_archived = false
       AND $1::uuid IS NOT NULL -- always reference $1 so Postgres knows its type even when \`where\` doesn't use it
       AND (${where})
     ORDER BY t.closure_requested_at NULLS LAST`,
    [viewerId, ...params]
  );
  const admin = isAdminRole(await getUserRole(viewerId));
  // Only the creator (or an admin) may accept a closure — same rule as POST /tasks/:id/approve.
  return rows.map((r: any) => ({ ...r, can_approve: admin || r.created_by === viewerId }));
}
