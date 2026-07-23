import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT n.*, d.name as dashboard_name
     FROM notifications n
     LEFT JOIN dashboards d ON d.id = n.dashboard_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 200`,
    [req.session.userId]
  );
  res.json(rows);
});

router.get("/unread-count", async (req, res) => {
  const { rows } = await query(
    `SELECT count(*)::int as count FROM notifications WHERE user_id = $1 AND is_read = false`,
    [req.session.userId]
  );
  res.json({ count: rows[0]?.count ?? 0 });
});

router.post("/read/:id", async (req, res) => {
  const { id } = req.params;
  await query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [id, req.session.userId]);
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [req.session.userId]);
  res.json({ ok: true });
});

export default router;
