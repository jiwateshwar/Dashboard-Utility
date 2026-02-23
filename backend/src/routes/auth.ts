import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  const { rows } = await query<{ id: string; is_active: boolean }>(
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

router.post("/verify", (req, res) => {
  const { otp } = req.body as { otp?: string };
  if (!req.session.pendingOtpUserId) {
    return res.status(400).json({ error: "No pending login" });
  }
  if (otp !== "1111") {
    return res.status(400).json({ error: "Invalid OTP" });
  }
  req.session.userId = req.session.pendingOtpUserId;
  req.session.pendingOtpUserId = undefined;
  res.json({ message: "Authenticated" });
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
