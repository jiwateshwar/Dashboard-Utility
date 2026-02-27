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

// ── Signup request management ───────────────────────────────────

// pending-count MUST be before /:id routes to avoid Express treating "pending-count" as an id
router.get("/signup-requests/pending-count", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.json({ count: 0 });
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM signup_requests WHERE status = 'Pending'`
  );
  res.json({ count: rows[0].count });
});

router.get("/signup-requests", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const { rows } = await query(
    `SELECT sr.id, sr.name, sr.email, sr.requested_at, sr.status,
            u.name  AS manager_name,
            r.name  AS reviewed_by_name
     FROM signup_requests sr
     LEFT JOIN users u ON u.id = sr.manager_id
     LEFT JOIN users r ON r.id = sr.reviewed_by
     ORDER BY sr.requested_at DESC`
  );
  res.json(rows);
});

router.post("/signup-requests/:id/approve", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });

  const { rows } = await query(
    `SELECT * FROM signup_requests WHERE id = $1 AND status = 'Pending'`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found or already reviewed" });
  const sr = rows[0];

  const dup = await query(`SELECT id FROM users WHERE email = $1`, [sr.email]);
  if (dup.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

  let level = 1;
  if (sr.manager_id) {
    const mgr = await query(`SELECT level FROM users WHERE id = $1`, [sr.manager_id]);
    level = Math.min((mgr.rows[0]?.level ?? 0) + 1, 5);
  }

  await query(
    `INSERT INTO users (id, name, email, manager_id, level, role, is_active)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'User', true)`,
    [sr.name, sr.email, sr.manager_id, level]
  );
  await query(
    `UPDATE signup_requests
     SET status = 'Approved', reviewed_by = $2, reviewed_at = now()
     WHERE id = $1`,
    [req.params.id, req.session.userId]
  );
  res.json({ ok: true });
});

router.post("/signup-requests/:id/reject", async (req, res) => {
  const role = await getUserRole(req.session.userId!);
  if (!isAdminRole(role)) return res.status(403).json({ error: "Admin only" });
  const result = await query(
    `UPDATE signup_requests
     SET status = 'Rejected', reviewed_by = $2, reviewed_at = now()
     WHERE id = $1 AND status = 'Pending'`,
    [req.params.id, req.session.userId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Not found or already reviewed" });
  res.json({ ok: true });
});

export default router;
