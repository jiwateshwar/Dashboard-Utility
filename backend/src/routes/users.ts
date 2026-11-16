import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query, pool } from "../db.js";
import { logAudit } from "../services/auditing.js";
import { getUserRole, isAdminRole } from "../services/permission.js";
import { willCreateLoop } from "../services/hierarchy.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, manager_id, level, is_active, role, created_at FROM users ORDER BY name`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) {
    return res.status(403).json({ error: "Admin only" });
  }
  const { manager_id, level, role: userRole } = req.body as any;
  const name = String((req.body as any).name ?? "").trim();
  const email = String((req.body as any).email ?? "").trim();
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address, e.g. name@comviva.com" });
  }
  // The DB's unique index is exact-match; also catch case/space variants (how duplicates crept in before).
  const taken = await query(`SELECT name FROM users WHERE lower(trim(email)) = lower($1)`, [email]);
  if (taken.rows.length > 0) return res.status(409).json({ error: `${taken.rows[0].name} already uses ${email}` });
  const id = uuid();
  let finalLevel = level ? Number(level) : 0;
  if (manager_id) {
    const manager = await query(`SELECT level FROM users WHERE id = $1`, [manager_id]);
    const managerLevel = manager.rows[0]?.level;
    if (!managerLevel) return res.status(400).json({ error: "Manager not found" });
    if (managerLevel >= 5) return res.status(400).json({ error: "Manager already at max level" });
    if (!finalLevel) finalLevel = managerLevel + 1;
    if (finalLevel <= managerLevel) return res.status(400).json({ error: "User level must be greater than manager level" });
  }
  if (!finalLevel) finalLevel = 1;
  if (manager_id && (await willCreateLoop(id, manager_id))) {
    return res.status(400).json({ error: "Hierarchy loop detected" });
  }
  try {
    await query(
      `INSERT INTO users (id, name, email, manager_id, level, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [id, name, email, manager_id || null, finalLevel, userRole || "User"]
    );
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    throw err;
  }
  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) {
    return res.status(403).json({ error: "Admin only" });
  }
  const { id } = req.params;
  const { name, manager_id, level, is_active, role: userRole } = req.body as any;

  // Email change: trimmed, valid, and not used by another account (case-insensitive).
  let email: string | null = null;
  if (typeof (req.body as any).email === "string") {
    email = (req.body as any).email.trim();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email!)) {
      return res.status(400).json({ error: "Enter a valid email address, e.g. name@comviva.com" });
    }
    const taken = await query(`SELECT name FROM users WHERE lower(trim(email)) = lower($1) AND id <> $2`, [email, id]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: `${taken.rows[0].name} already uses ${email}` });
    }
  }
  const before = (await query(`SELECT email FROM users WHERE id = $1`, [id])).rows[0];
  if (!before) return res.status(404).json({ error: "User not found" });

  if (manager_id && (await willCreateLoop(id, manager_id))) {
    return res.status(400).json({ error: "Hierarchy loop detected" });
  }
  if (manager_id) {
    const manager = await query(`SELECT level FROM users WHERE id = $1`, [manager_id]);
    const managerLevel = manager.rows[0]?.level;
    if (!managerLevel) return res.status(400).json({ error: "Manager not found" });
    if (managerLevel >= 5) return res.status(400).json({ error: "Manager already at max level" });
    if (level && level <= managerLevel) return res.status(400).json({ error: "User level must be greater than manager level" });
  }
  await query(
    `UPDATE users
     SET name = COALESCE($2, name),
         manager_id = $3,
         level = COALESCE($4, level),
         is_active = COALESCE($5, is_active),
         role = COALESCE($6, role),
         email = COALESCE($7, email),
         updated_at = now()
     WHERE id = $1`,
    [id, name || null, manager_id || null, level || null, is_active, userRole || null, email]
  );
  if (email && email !== before.email) {
    await logAudit({ entityType: "User", entityId: id, changedBy: req.session.userId!, oldValue: { email: before.email }, newValue: { email } });
  }
  res.json({ ok: true });
});

// What ties a user to PRISM's history. Any of these blocks deletion: removing
// the user would either fail (required links) or silently erase data
// (e.g. task co-ownership, dashboard ownership), so such users are
// deactivated instead, which keeps their history and stops their emails.
const USER_LINKS: { label: string; sql: string }[] = [
  { label: "tasks they own", sql: `SELECT count(*) FROM tasks WHERE owner_id = $1 OR id IN (SELECT task_id FROM task_owners WHERE user_id = $1)` },
  { label: "tasks they created", sql: `SELECT count(*) FROM tasks WHERE created_by = $1 OR closure_approved_by = $1` },
  { label: "risks", sql: `SELECT count(*) FROM risks WHERE risk_owner = $1` },
  { label: "decisions", sql: `SELECT count(*) FROM decisions WHERE decision_owner = $1 OR created_by = $1 OR approved_by = $1` },
  { label: "dashboards they own", sql: `SELECT count(*) FROM dashboards d WHERE d.primary_owner_id = $1 OR d.secondary_owner_id = $1 OR EXISTS (SELECT 1 FROM dashboard_owners o WHERE o.dashboard_id = d.id AND o.user_id = $1)` },
  { label: "people reporting to them", sql: `SELECT count(*) FROM users WHERE manager_id = $1` },
  { label: "audit-log entries", sql: `SELECT count(*) FROM audit_log WHERE changed_by = $1` },
  { label: "escalations", sql: `SELECT count(*) FROM escalations WHERE notified_user_id = $1` },
  { label: "feedback", sql: `SELECT count(*) FROM feedback WHERE created_by = $1` },
  { label: "links", sql: `SELECT count(*) FROM links WHERE owner_id = $1` },
  { label: "share teams created", sql: `SELECT count(*) FROM teams WHERE created_by = $1` },
  { label: "hashtags added", sql: `SELECT count(*) FROM task_tags WHERE created_by = $1` },
  { label: "requests reviewed", sql: `SELECT (SELECT count(*) FROM dashboard_access_requests WHERE reviewed_by = $1) + (SELECT count(*) FROM dashboard_delete_requests WHERE requested_by = $1 OR reviewed_by = $1) + (SELECT count(*) FROM signup_requests WHERE manager_id = $1 OR reviewed_by = $1)` }
];

// Permanently deletes a user who has no work or history in PRISM (e.g. a
// duplicate or mistyped account). Otherwise 409 with what they're linked to.
router.delete("/:id", async (req, res) => {
  const actorId = req.session.userId!;
  const actorRole = await getUserRole(actorId);
  if (!isAdminRole(actorRole)) return res.status(403).json({ error: "Admin only" });
  const { id } = req.params;
  if (id === actorId) return res.status(400).json({ error: "You can't delete your own account" });

  const target = (await query(`SELECT id, name, email, role::text AS role FROM users WHERE id = $1`, [id])).rows[0];
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.role === "SuperAdmin" && actorRole !== "SuperAdmin") {
    return res.status(403).json({ error: "Only a SuperAdmin can delete a SuperAdmin" });
  }

  const linked: string[] = [];
  for (const l of USER_LINKS) {
    const n = Number((await query(l.sql, [id])).rows[0].count ?? 0);
    if (n > 0) linked.push(`${n} ${l.label}`);
  }
  if (linked.length > 0) {
    return res.status(409).json({
      error: `${target.name} can't be deleted because they have history in PRISM: ${linked.join(", ")}. Deactivate them instead — that keeps the history and stops their access and emails.`,
      linked
    });
  }

  // Nothing important points at them: clear their sign-in log (no cascade on
  // that table) and delete; sessions, access rows, notifications, email
  // preferences, visits, SSO links and team memberships cascade.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM login_history WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM session WHERE sess->>'userId' = $1`, [id]);
    await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return res.status(409).json({ error: `${target.name} is still linked to other records (${err.table ?? "unknown"}). Deactivate them instead.` });
    }
    throw err;
  } finally {
    client.release();
  }
  await logAudit({ entityType: "User", entityId: id, changedBy: actorId, oldValue: { name: target.name, email: target.email, role: target.role }, newValue: { action: "deleted" } });
  res.json({ ok: true });
});

export default router;
