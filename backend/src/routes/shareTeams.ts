import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isAdminRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

// List all teams — open to any authenticated user (used by the Links sharing picker).
router.get("/", async (_req, res) => {
  const { rows } = await query(
    `SELECT t.*, COUNT(tm.user_id)::int AS member_count
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     GROUP BY t.id
     ORDER BY t.name`
  );
  res.json(rows);
});

// Teams the requester belongs to.
router.get("/mine", async (req, res) => {
  const { rows } = await query(
    `SELECT t.id, t.name FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1
     ORDER BY t.name`,
    [req.session.userId]
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { name, description } = req.body as any;
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uuid();
  await query(
    `INSERT INTO teams (id, name, description, created_by) VALUES ($1, $2, $3, $4)`,
    [id, name, description || null, req.session.userId]
  );
  res.json({ id });
});

router.put("/:id", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { name, description } = req.body as any;
  await query(
    `UPDATE teams SET name = COALESCE($2, name), description = $3, updated_at = now() WHERE id = $1`,
    [req.params.id, name || null, description ?? null]
  );
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  await query(`DELETE FROM teams WHERE id = $1`, [req.params.id]);
  // Any link that lost its last team share falls back to private.
  await query(
    `UPDATE links SET visibility = 'private'
     WHERE visibility = 'shared' AND NOT EXISTS (SELECT 1 FROM link_teams WHERE link_id = links.id)`
  );
  res.json({ ok: true });
});

// All users with an in_team flag for a specific team — for the membership picker.
router.get("/:id/members", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { rows } = await query(
    `SELECT u.id AS user_id, u.name, u.email,
       EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = u.id) AS in_team
     FROM users u
     WHERE u.is_active = true
     ORDER BY u.name`,
    [req.params.id]
  );
  res.json(rows);
});

router.post("/:id/members", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { user_ids } = req.body as any;
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: "user_ids required" });
  }
  for (const userId of user_ids) {
    await query(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, userId]
    );
  }
  res.json({ ok: true });
});

router.delete("/:id/members/:userId", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  await query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [req.params.id, req.params.userId]
  );
  res.json({ ok: true });
});

export default router;
