import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.session.userId]
  );
  res.json(rows);
});

router.post("/read/:id", async (req, res) => {
  const { id } = req.params;
  await query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [id, req.session.userId]);
  res.json({ ok: true });
});

export default router;
