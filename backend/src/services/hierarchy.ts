import { query } from "../db.js";

export async function getSubordinateIds(managerId: string) {
  const { rows } = await query<{ id: string }>(
    `WITH RECURSIVE subordinates AS (
      SELECT id FROM users WHERE manager_id = $1 AND is_active = true
      UNION ALL
      SELECT u.id FROM users u
      INNER JOIN subordinates s ON u.manager_id = s.id
      WHERE u.is_active = true
    )
    SELECT id FROM subordinates`,
    [managerId]
  );
  return rows.map((r) => r.id);
}

export async function willCreateLoop(userId: string, managerId: string) {
  if (userId === managerId) return true;
  const subordinates = await getSubordinateIds(userId);
  return subordinates.includes(managerId);
}
