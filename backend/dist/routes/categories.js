import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { isDashboardOwner } from "../services/permission.js";
const router = Router();
router.use(requireAuth);
router.get("/", async (req, res) => {
    const { dashboard_id } = req.query;
    if (!dashboard_id)
        return res.status(400).json({ error: "dashboard_id required" });
    const { rows } = await query(`SELECT * FROM categories WHERE dashboard_id = $1 ORDER BY name`, [dashboard_id]);
    res.json(rows);
});
router.post("/", async (req, res) => {
    const { dashboard_id, name } = req.body;
    if (!dashboard_id || !name)
        return res.status(400).json({ error: "Missing fields" });
    const owner = await isDashboardOwner(req.session.userId, dashboard_id);
    if (!owner)
        return res.status(403).json({ error: "Owners only" });
    const id = uuid();
    await query(`INSERT INTO categories (id, dashboard_id, name) VALUES ($1, $2, $3)`, [id, dashboard_id, name]);
    res.json({ id });
});
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { dashboard_id, name, is_active } = req.body;
    if (!dashboard_id)
        return res.status(400).json({ error: "dashboard_id required" });
    const owner = await isDashboardOwner(req.session.userId, dashboard_id);
    if (!owner)
        return res.status(403).json({ error: "Owners only" });
    await query(`UPDATE categories
     SET name = COALESCE($2, name),
         is_active = COALESCE($3, is_active),
         updated_at = now()
     WHERE id = $1`, [id, name || null, is_active]);
    res.json({ ok: true });
});
export default router;
