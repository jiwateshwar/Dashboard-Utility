import fs from "fs";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole } from "../services/permission.js";
import { env } from "../utils/env.js";
import { createSnapshot, restoreSnapshot, registerImportedSnapshot } from "../services/dbSnapshot.js";

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.snapshotMaxUploadMb * 1024 * 1024 }
});

const IMPORT_CONFIRM_PHRASE = "REPLACE ALL DATA";
const ROLLBACK_CONFIRM_PHRASE = "ROLLBACK";

async function requireSuperAdmin(req: any, res: any): Promise<boolean> {
  const role = await getUserRole(req.session.userId!);
  if (role !== "SuperAdmin") {
    res.status(403).json({ error: "SuperAdmin only" });
    return false;
  }
  return true;
}

router.get("/", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { rows } = await query(
    `SELECT s.id, s.created_at, s.trigger_type, s.status, s.size_bytes,
            s.schema_last_migration, s.table_row_counts, s.error_message,
            u.name AS created_by_name
     FROM db_snapshots s
     LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.created_at DESC`
  );
  res.json(rows);
});

router.post("/manual", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  try {
    const id = await createSnapshot("manual_export", req.session.userId!);
    const { rows } = await query(`SELECT * FROM db_snapshots WHERE id = $1`, [id]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create snapshot" });
  }
});

router.get("/:id/download", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { rows } = await query(`SELECT * FROM db_snapshots WHERE id = $1 AND status = 'complete'`, [req.params.id]);
  const snapshot = rows[0];
  if (!snapshot || !snapshot.file_path) return res.status(404).json({ error: "Snapshot not found" });

  const dateStr = new Date(snapshot.created_at).toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="prism-backup-${dateStr}.json.gz"`);
  fs.createReadStream(snapshot.file_path).pipe(res);
});

router.post("/import", upload.single("file"), async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  if ((req.body?.confirm || "") !== IMPORT_CONFIRM_PHRASE) {
    return res.status(400).json({ error: `Type "${IMPORT_CONFIRM_PHRASE}" to confirm` });
  }

  try {
    const registered = await registerImportedSnapshot(req.file.buffer, req.session.userId!);
    if (!registered.compatible) {
      return res.status(409).json({
        error: `This backup requires migration(s) not present on this server: ${registered.missing.join(", ")}. Update PRISM first.`
      });
    }
    await restoreSnapshot(registered.id, req.session.userId!);
    res.json({ ok: true, forceLogout: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Import failed" });
  }
});

router.post("/:id/rollback", async (req, res) => {
  if (!(await requireSuperAdmin(req, res))) return;
  if ((req.body?.confirm || "") !== ROLLBACK_CONFIRM_PHRASE) {
    return res.status(400).json({ error: `Type "${ROLLBACK_CONFIRM_PHRASE}" to confirm` });
  }
  try {
    await restoreSnapshot(req.params.id, req.session.userId!);
    res.json({ ok: true, forceLogout: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Rollback failed" });
  }
});

export default router;
