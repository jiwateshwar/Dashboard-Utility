import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const { rows } = await query(`SELECT * FROM groups ORDER BY name`);
  res.json(rows);
});

router.post("/", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (role !== "Admin") return res.status(403).json({ error: "Admin only" });
  const { name, description } = req.body as any;
  if (!name) return res.status(400).json({ error: "Name required" });
  const id = uuid();
  await query(
    `INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)`,
    [id, name, description || null]
  );
  res.json({ id });
});

router.post("/assign", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (role !== "Admin") return res.status(403).json({ error: "Admin only" });
  const { dashboard_id, group_id } = req.body as any;
  if (!dashboard_id || !group_id) return res.status(400).json({ error: "Missing fields" });
  await query(
    `INSERT INTO dashboard_groups (dashboard_id, group_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [dashboard_id, group_id]
  );
  res.json({ ok: true });
});

export default router;
