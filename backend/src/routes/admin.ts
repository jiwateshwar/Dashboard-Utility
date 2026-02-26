import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isAdminRole } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

// Currently logged-in users (sessions that have not expired and have a userId)
router.get("/active-sessions", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });

  const { rows } = await query(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM session s
     JOIN users u ON u.id = (s.sess->>'userId')::uuid
     WHERE s.expire > NOW()
       AND s.sess->>'userId' IS NOT NULL
     ORDER BY u.name`
  );
  res.json(rows);
});

// Full login history with optional filters (last 500 entries)
router.get("/login-history", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });

  const { user_id, from_date, to_date } = req.query as any;
  const { rows } = await query(
    `SELECT lh.id, lh.logged_in_at, lh.ip_address, lh.user_agent,
            u.id AS user_id, u.name, u.email
     FROM login_history lh
     JOIN users u ON u.id = lh.user_id
     WHERE ($1::uuid IS NULL OR lh.user_id = $1)
       AND ($2::timestamptz IS NULL OR lh.logged_in_at >= $2)
       AND ($3::timestamptz IS NULL OR lh.logged_in_at <= $3)
     ORDER BY lh.logged_in_at DESC
     LIMIT 500`,
    [user_id || null, from_date || null, to_date || null]
  );
  res.json(rows);
});

export default router;
