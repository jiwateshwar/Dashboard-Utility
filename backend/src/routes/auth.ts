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
  res.json({ message: "OTP required", otp: "1111" });
});

router.post("/verify", async (req, res) => {
  const { otp } = req.body as { otp?: string };
  if (!req.session.pendingOtpUserId) {
    return res.status(400).json({ error: "No pending login" });
  }
  if (otp !== "1111") {
    return res.status(400).json({ error: "Invalid OTP" });
  }
  const userId = req.session.pendingOtpUserId;
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
    `SELECT id, name, email, manager_id, level, role, is_active FROM users WHERE id = $1`,
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
