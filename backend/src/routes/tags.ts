import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const router = Router();
router.use(requireAuth);

// Global autocomplete: suggests hashtags already used by anyone, with a usage count
// spanning all dashboards (deliberately not access-scoped — only a tag string + count
// is exposed here, no item content).
router.get("/suggest", async (req, res) => {
  const { q } = req.query as any;
  const normalizedQuery = String(q ?? "").trim().replace(/^#/, "").toLowerCase();

  const { rows } = await query(
    `SELECT tag, count(*)::int as count
     FROM task_tags
     WHERE tag ILIKE $1 || '%'
     GROUP BY tag
     ORDER BY count(*) DESC, tag ASC
     LIMIT 10`,
    [normalizedQuery]
  );

  res.json(rows);
});

export default router;
