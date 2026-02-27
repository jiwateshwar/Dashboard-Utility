import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const { rows } = await query(
    `SELECT id, is_active FROM users WHERE email = $1`,
    [email]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  if (!rows[0].is_active) {
    return res.status(403).json({ error: "User inactive" });
  }
  req.session.pendingOtpUserId = rows[0].id;
  res.json({ message: "Employee ID required" });
});

router.post("/verify", async (req, res) => {
  const { otp } = req.body as { otp?: string };
  if (!req.session.pendingOtpUserId) {
    return res.status(400).json({ error: "No pending login" });
  }
  const userId = req.session.pendingOtpUserId;

  const { rows: eidRows } = await query(
    `SELECT employee_id FROM users WHERE id = $1`, [userId]
  );
  const validOtp: string = eidRows[0]?.employee_id ?? "1111";
  if (otp !== validOtp) {
    return res.status(400).json({ error: "Invalid employee ID" });
  }

  req.session.userId = userId;
  req.session.pendingOtpUserId = undefined;

  // Record login event for access logs
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
  await query(
    `INSERT INTO login_history (user_id, ip_address, user_agent) VALUES ($1, $2, $3)`,
    [userId, req.ip ?? null, req.headers["user-agent"] ?? null]
  );

  res.json({ message: "Authenticated" });
});

// Authenticated: update own employee ID
router.patch("/me/employee-id", requireAuth, async (req, res) => {
  const { employee_id } = req.body as { employee_id?: string };
  if (!employee_id || employee_id.length < 4 || employee_id.length > 10) {
    return res.status(400).json({ error: "Employee ID must be 4–10 characters" });
  }
  await query(
    `UPDATE users SET employee_id = $1 WHERE id = $2`,
    [employee_id, req.session.userId]
  );
  res.json({ ok: true });
});

// Public: manager list for signup dropdown
router.get("/managers", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name FROM users WHERE is_active = true ORDER BY name`
  );
  res.json(rows);
});

// Public: submit a signup request
router.post("/signup", async (req, res) => {
  const { name, email, manager_id } = req.body as any;
  if (!name || !email || !manager_id) {
    return res.status(400).json({ error: "Name, email and manager are required" });
  }

  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const pending = await query(
    `SELECT id FROM signup_requests WHERE email = $1 AND status = 'Pending'`, [email]
  );
  if (pending.rows.length > 0) {
    return res.status(409).json({ error: "A signup request for this email is already pending" });
  }

  await query(
    `INSERT INTO signup_requests (name, email, manager_id) VALUES ($1, $2, $3)`,
    [name, email, manager_id]
  );

  // Notify all active admins
  const admins = await query(
    `SELECT id FROM users WHERE role::text IN ('Admin', 'SuperAdmin') AND is_active = true`
  );
  for (const admin of admins.rows) {
    await query(
      `INSERT INTO notifications (id, user_id, message) VALUES (gen_random_uuid(), $1, $2)`,
      [admin.id, `New signup request from ${name} (${email})`]
    );
  }

  res.json({ message: "Request submitted. An admin will review your request." });
});

router.get("/stats", async (_req, res) => {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM users   WHERE is_active = true) AS users,
       (SELECT COUNT(*)::int FROM dashboards WHERE is_active = true) AS dashboards,
       (SELECT COUNT(*)::int FROM tasks   WHERE is_archived = false) AS tasks`
  );
  res.json(rows[0]);
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, email, manager_id, level, role, is_active, employee_id FROM users WHERE id = $1`,
    [req.session.userId]
  );
  res.json(rows[0]);
});

router.post("/logout", requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.json({ message: "Logged out" });
  });
});

export default router;
