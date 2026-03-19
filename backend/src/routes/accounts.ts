import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { canManageAccounts } from "../services/permission.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const { rows } = await query(`SELECT * FROM accounts ORDER BY account_name`);
  res.json(rows);
});

// Admin-only: list pending accounts with proposer info
router.get("/pending", async (req, res) => {
  const userId = req.session.userId!;
  const { rows: userRows } = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
  const role = userRows[0]?.role;
  if (!["Admin", "SuperAdmin"].includes(role)) return res.status(403).json({ error: "Not allowed" });

  const { rows } = await query(
    `SELECT a.*, u.name AS proposed_by_name
     FROM accounts a
     LEFT JOIN users u ON u.id = a.proposed_by_user_id
     WHERE a.is_pending = true
     ORDER BY a.created_at ASC`
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { dashboard_id } = req.body as any;
  const ok = await canManageAccounts(req.session.userId!, dashboard_id);
  if (!ok) return res.status(403).json({ error: "Not allowed" });
  const { account_name, account_type, region } = req.body as any;
  if (!account_name) return res.status(400).json({ error: "account_name required" });
  const id = uuid();
  await query(
    `INSERT INTO accounts (id, account_name, account_type, region)
     VALUES ($1, $2, $3, $4)`,
    [id, account_name, account_type || null, region || null]
  );
  res.json({ id });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { dashboard_id, account_name, account_type, region, is_active } = req.body as any;
  const ok = await canManageAccounts(req.session.userId!, dashboard_id);
  if (!ok) return res.status(403).json({ error: "Not allowed" });
  await query(
    `UPDATE accounts
     SET account_name = COALESCE($2, account_name),
         account_type = COALESCE($3, account_type),
         region = COALESCE($4, region),
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $1`,
    [id, account_name || null, account_type || null, region || null, is_active]
  );
  res.json({ ok: true });
});

// Admin/SuperAdmin: approve a pending account (optionally rename first)
router.post("/:id/approve", async (req, res) => {
  const userId = req.session.userId!;
  const { rows: userRows } = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
  const role = userRows[0]?.role;
  if (!["Admin", "SuperAdmin"].includes(role)) return res.status(403).json({ error: "Not allowed" });

  const { id } = req.params;
  const { account_name } = req.body as any; // optional rename

  await query(
    `UPDATE accounts
     SET is_pending = false,
         is_active = true,
         account_name = COALESCE($2, account_name),
         updated_at = now()
     WHERE id = $1`,
    [id, account_name || null]
  );

  // Notify the proposer
  const { rows: acctRows } = await query(
    `SELECT a.account_name, a.proposed_by_user_id, u.name AS admin_name
     FROM accounts a
     CROSS JOIN users u
     WHERE a.id = $1 AND u.id = $2`,
    [id, userId]
  );
  const acct = acctRows[0];
  if (acct?.proposed_by_user_id) {
    const finalName = account_name || acct.account_name;
    await query(
      `INSERT INTO notifications (id, user_id, message) VALUES ($1, $2, $3)`,
      [uuid(), acct.proposed_by_user_id,
        `Your proposed account "${acct.account_name}" has been approved${account_name && account_name !== acct.account_name ? ` and renamed to "${account_name}"` : ""} by ${acct.admin_name}.`]
    );
    void finalName; // suppress unused warning
  }

  res.json({ ok: true });
});

// Admin/SuperAdmin: reject a pending account (deactivates it)
router.post("/:id/reject", async (req, res) => {
  const userId = req.session.userId!;
  const { rows: userRows } = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
  const role = userRows[0]?.role;
  if (!["Admin", "SuperAdmin"].includes(role)) return res.status(403).json({ error: "Not allowed" });

  const { id } = req.params;
  const { rows: acctRows } = await query(
    `SELECT a.account_name, a.proposed_by_user_id, u.name AS admin_name
     FROM accounts a
     CROSS JOIN users u
     WHERE a.id = $1 AND u.id = $2`,
    [id, userId]
  );
  const acct = acctRows[0];

  await query(
    `UPDATE accounts SET is_pending = false, is_active = false, updated_at = now() WHERE id = $1`,
    [id]
  );

  if (acct?.proposed_by_user_id) {
    await query(
      `INSERT INTO notifications (id, user_id, message) VALUES ($1, $2, $3)`,
      [uuid(), acct.proposed_by_user_id,
        `Your proposed account "${acct.account_name}" was not approved by ${acct.admin_name}. The task has been retained but the account is inactive.`]
    );
  }

  res.json({ ok: true });
});

export default router;
