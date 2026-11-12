import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// The browser pings this (at most once a minute) while the user is actually
// using the app — scrolling, clicking or typing on a visible page. The write
// is skipped if last_active_at was set less than a minute ago.
router.post("/ping", async (req, res) => {
  await query(
    `UPDATE users SET last_active_at = now()
     WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '1 minute')`,
    [req.session.userId]
  );
  res.status(204).end();
});

export default router;
