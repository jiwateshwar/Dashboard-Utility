import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

// List all feedback — everyone can see everything
router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT f.*, u.name AS author_name
     FROM feedback f
     JOIN users u ON u.id = f.created_by
     ORDER BY f.created_at DESC`
  );
  res.json(rows);
});

// Submit a new entry
router.post("/", async (req, res) => {
  const userId = req.session.userId!;
  const { type, title, description } = req.body as any;
  if (!type || !title) return res.status(400).json({ error: "type and title are required" });
  if (!["Bug", "Idea"].includes(type)) return res.status(400).json({ error: "type must be Bug or Idea" });
  const id = uuid();
  await query(
    `INSERT INTO feedback (id, type, title, description, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, type, title, description || null, userId]
  );
  res.json({ id });
});

// Update status — Admin only
router.patch("/:id", async (req, res) => {
  const userId = req.session.userId!;
  const role = await getUserRole(userId);
  if (role !== "Admin") return res.status(403).json({ error: "Admin only" });
  const { status } = req.body as any;
  if (!["Open", "In Review", "Done"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  await query(`UPDATE feedback SET status = $1 WHERE id = $2`, [status, req.params.id]);
  res.json({ ok: true });
});

export default router;
