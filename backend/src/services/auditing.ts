import { v4 as uuid } from "uuid";
import { query } from "../db.js";

export async function logAudit(params: {
  entityType: string;
  entityId: string;
  changedBy: string;
  oldValue: unknown;
  newValue: unknown;
}) {
  const { entityType, entityId, changedBy, oldValue, newValue } = params;
  await query(
    `INSERT INTO audit_log (id, entity_type, entity_id, changed_by, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuid(), entityType, entityId, changedBy, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
  );
}
