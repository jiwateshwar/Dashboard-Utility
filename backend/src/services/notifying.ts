import { v4 as uuid } from "uuid";
import { query } from "../db.js";

export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "dashboard_assigned"
  | "task_overdue";

export async function notifyUser(params: {
  userId: string;
  message: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
  dashboardId?: string;
}) {
  const { userId, message, type, entityType, entityId, dashboardId } = params;
  await query(
    `INSERT INTO notifications (id, user_id, message, type, entity_type, entity_id, dashboard_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), userId, message, type, entityType ?? null, entityId ?? null, dashboardId ?? null]
  );
}
