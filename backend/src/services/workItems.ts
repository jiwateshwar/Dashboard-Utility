import { query } from "../db.js";

// Shared listings for the Personal and Team views. Each row carries what the
// editable tables need: dashboard name (for context and the link), owner ids
// and names, and tags. `where` is extra SQL on the item alias using $1.. params.

export async function listTasks(where: string, params: unknown[]) {
  const { rows } = await query(
    `SELECT t.*, d.name AS dashboard_name,
            COALESCE((SELECT array_agg(o.user_id ORDER BY o.user_id) FROM task_owners o WHERE o.task_id = t.id), ARRAY[t.owner_id]) AS owner_ids,
            COALESCE((SELECT array_agg(ou.name ORDER BY o.user_id) FROM task_owners o JOIN users ou ON ou.id = o.user_id WHERE o.task_id = t.id),
                     ARRAY[(SELECT name FROM users WHERE id = t.owner_id)]) AS owner_names,
            COALESCE((SELECT array_agg(tg.tag ORDER BY tg.tag) FROM task_tags tg WHERE tg.task_id = t.id), ARRAY[]::text[]) AS tags
     FROM tasks t
     JOIN dashboards d ON d.id = t.dashboard_id AND d.is_active = true
     WHERE t.is_archived = false AND (${where})
     ORDER BY t.target_date NULLS LAST, t.created_at DESC`,
    params
  );
  return rows;
}

export async function listRisks(where: string, params: unknown[]) {
  const { rows } = await query(
    `SELECT r.*, d.name AS dashboard_name, u.name AS owner_name
     FROM risks r JOIN dashboards d ON d.id = r.dashboard_id AND d.is_active = true LEFT JOIN users u ON u.id = r.risk_owner
     WHERE r.is_archived = false AND (${where})
     ORDER BY r.target_mitigation_date NULLS LAST`,
    params
  );
  return rows;
}

export async function listDecisions(where: string, params: unknown[]) {
  const { rows } = await query(
    `SELECT dc.*, d.name AS dashboard_name, u.name AS owner_name
     FROM decisions dc JOIN dashboards d ON d.id = dc.dashboard_id AND d.is_active = true LEFT JOIN users u ON u.id = dc.decision_owner
     WHERE dc.is_archived = false AND (${where})
     ORDER BY dc.decision_deadline NULLS LAST`,
    params
  );
  return rows;
}
