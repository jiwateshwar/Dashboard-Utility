import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole } from "../services/permission.js";
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
  if (role !== "Admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  const { name, email, manager_id, level, role: userRole } = req.body as any;
  if (!name || !email) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const id = uuid();
  let finalLevel = level;
  if (manager_id) {
    const manager = await query(`SELECT level FROM users WHERE id = $1`, [manager_id]);
    const managerLevel = manager.rows[0]?.level;
    if (!managerLevel) return res.status(400).json({ error: "Manager not found" });
    if (managerLevel >= 5) return res.status(400).json({ error: "Manager already at max level" });
    if (!finalLevel) finalLevel = managerLevel + 1;
    if (finalLevel <= managerLevel) return res.status(400).json({ error: "User level must be greater than manager level" });
  }
  if (!finalLevel) {
    return res.status(400).json({ error: "level required" });
  }
  if (manager_id && (await willCreateLoop(id, manager_id))) {
    return res.status(400).json({ error: "Hierarchy loop detected" });
  }
  await query(
    `INSERT INTO users (id, name, email, manager_id, level, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [id, name, email, manager_id || null, finalLevel, userRole || "User"]
  );
  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (role !== "Admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  const { id } = req.params;
  const { name, manager_id, level, is_active, role: userRole } = req.body as any;
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
         updated_at = now()
     WHERE id = $1`,
    [id, name || null, manager_id || null, level || null, is_active, userRole || null]
  );
  res.json({ ok: true });
});

export default router;
