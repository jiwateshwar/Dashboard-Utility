import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { isLinkOwner, hasLinkAccess } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

const linkInputSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  team_ids: z.array(z.string().uuid()).optional()
});

const linkUpdateSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable()
});

async function validateTeamIds(teamIds: string[]) {
  if (teamIds.length === 0) return true;
  const { rows } = await query(
    `SELECT id FROM teams WHERE id = ANY($1::uuid[])`,
    [teamIds]
  );
  return rows.length === teamIds.length;
}

// scope=mine (default): everything the requester owns.
// scope=shared: links owned by others, shared with any team the requester belongs to.
router.get("/", async (req, res) => {
  const userId = req.session.userId!;
  const scope = req.query.scope === "shared" ? "shared" : "mine";

  if (scope === "mine") {
    const { rows } = await query(
      `SELECT l.*,
         COALESCE((SELECT array_agg(lt.team_id) FROM link_teams lt WHERE lt.link_id = l.id), ARRAY[]::uuid[]) AS team_ids,
         COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
                   FROM link_teams lt JOIN teams t ON t.id = lt.team_id WHERE lt.link_id = l.id), '[]') AS teams
       FROM links l
       WHERE l.owner_id = $1
       ORDER BY l.created_at DESC`,
      [userId]
    );
    return res.json(rows);
  }

  const { rows } = await query(
    `SELECT DISTINCT l.*, u.name AS owner_name,
       COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
                 FROM link_teams lt2 JOIN teams t ON t.id = lt2.team_id WHERE lt2.link_id = l.id), '[]') AS teams
     FROM links l
     JOIN link_teams lt ON lt.link_id = l.id
     JOIN team_members tm ON tm.team_id = lt.team_id
     JOIN users u ON u.id = l.owner_id
     WHERE tm.user_id = $1 AND l.owner_id <> $1
     ORDER BY l.created_at DESC`,
    [userId]
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await hasLinkAccess(userId, req.params.id))) {
    return res.status(403).json({ error: "No access to this link" });
  }
  const { rows } = await query(
    `SELECT l.*, u.name AS owner_name,
       COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
                 FROM link_teams lt JOIN teams t ON t.id = lt.team_id WHERE lt.link_id = l.id), '[]') AS teams
     FROM links l JOIN users u ON u.id = l.owner_id
     WHERE l.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const parsed = linkInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid link data" });
  const { url, title, description, team_ids = [] } = parsed.data;

  if (!(await validateTeamIds(team_ids))) {
    return res.status(400).json({ error: "One or more teams do not exist" });
  }

  const id = uuid();
  const visibility = team_ids.length > 0 ? "shared" : "private";
  await query(
    `INSERT INTO links (id, owner_id, url, title, description, visibility)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, req.session.userId, url, title, description || null, visibility]
  );
  for (const teamId of team_ids) {
    await query(
      `INSERT INTO link_teams (link_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, teamId]
    );
  }
  res.json({ id });
});

router.put("/:id", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await isLinkOwner(userId, req.params.id))) {
    return res.status(403).json({ error: "Owner only" });
  }
  const parsed = linkUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid link data" });
  const { url, title, description } = parsed.data;
  await query(
    `UPDATE links SET
       url = COALESCE($2, url),
       title = COALESCE($3, title),
       description = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE description END,
       updated_at = now()
     WHERE id = $1`,
    [req.params.id, url || null, title || null, description ?? null]
  );
  res.json({ ok: true });
});

router.delete("/:id", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await isLinkOwner(userId, req.params.id))) {
    return res.status(403).json({ error: "Owner only" });
  }
  await query(`DELETE FROM links WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

router.get("/:id/teams", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await isLinkOwner(userId, req.params.id))) {
    return res.status(403).json({ error: "Owner only" });
  }
  const { rows } = await query(
    `SELECT t.id AS team_id, t.name FROM link_teams lt JOIN teams t ON t.id = lt.team_id WHERE lt.link_id = $1`,
    [req.params.id]
  );
  res.json(rows);
});

router.post("/:id/teams", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await isLinkOwner(userId, req.params.id))) {
    return res.status(403).json({ error: "Owner only" });
  }
  const { team_ids } = req.body as any;
  if (!Array.isArray(team_ids) || team_ids.length === 0) {
    return res.status(400).json({ error: "team_ids required" });
  }
  if (!(await validateTeamIds(team_ids))) {
    return res.status(400).json({ error: "One or more teams do not exist" });
  }
  for (const teamId of team_ids) {
    await query(
      `INSERT INTO link_teams (link_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, teamId]
    );
  }
  await query(`UPDATE links SET visibility = 'shared', updated_at = now() WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

router.delete("/:id/teams/:teamId", async (req, res) => {
  const userId = req.session.userId!;
  if (!(await isLinkOwner(userId, req.params.id))) {
    return res.status(403).json({ error: "Owner only" });
  }
  await query(
    `DELETE FROM link_teams WHERE link_id = $1 AND team_id = $2`,
    [req.params.id, req.params.teamId]
  );
  const remaining = await query(`SELECT 1 FROM link_teams WHERE link_id = $1`, [req.params.id]);
  if (remaining.rows.length === 0) {
    await query(`UPDATE links SET visibility = 'private', updated_at = now() WHERE id = $1`, [req.params.id]);
  }
  res.json({ ok: true });
});

export default router;
