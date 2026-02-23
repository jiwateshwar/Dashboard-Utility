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

export default router;
