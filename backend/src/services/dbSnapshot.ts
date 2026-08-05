import fs from "fs/promises";
import path from "path";
import zlib from "zlib";
import { PoolClient } from "pg";
import { query, pool } from "../db.js";
import { env } from "../utils/env.js";

// Ordered parent → child. Two self-referencing tables (users.manager_id,
// dashboards.parent_dashboard_id) are restored with a topological pass —
// see insertSelfReferencing().
type TableSpec = { name: string; selfRefColumn?: string };

const TABLE_EXPORT_ORDER: TableSpec[] = [
  { name: "users", selfRefColumn: "manager_id" },
  { name: "accounts" },
  { name: "groups" },
  { name: "dashboards", selfRefColumn: "parent_dashboard_id" },
  { name: "dashboard_owners" },
  { name: "dashboard_groups" },
  { name: "dashboard_access" },
  { name: "dashboard_access_requests" },
  { name: "dashboard_delete_requests" },
  { name: "categories" },
  { name: "tasks" },
  { name: "task_owners" },
  { name: "task_tags" },
  { name: "risks" },
  { name: "decisions" },
  { name: "publishing_snapshots" },
  { name: "escalations" },
  { name: "escalation_rules" },
  { name: "notifications" },
  { name: "feedback" },
  { name: "login_history" },
  { name: "signup_requests" },
  { name: "audit_log" },
  { name: "sso_identities" },
  { name: "teams" },
  { name: "team_members" },
  { name: "links" },
  { name: "link_teams" }
];

// Tables intentionally excluded from every snapshot: session data is
// transient, schema_migrations/db_snapshots are the migration/backup
// system's own bookkeeping and shouldn't recursively back themselves up.
const EXCLUDED_TABLES = new Set(["session", "schema_migrations", "db_snapshots"]);

type SnapshotManifest = {
  formatVersion: number;
  createdAt: string;
  triggerType: string;
  schemaMigrations: string[];
  tables: { name: string; columns: string[] }[];
};

type SnapshotFile = { manifest: SnapshotManifest; data: Record<string, any[]> };

/**
 * Fails loudly if a table exists in the live schema but was never added to
 * TABLE_EXPORT_ORDER — turns "silently dropped from every future backup"
 * into "backup fails immediately with a clear error."
 */
async function assertRegistryComplete() {
  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const known = new Set([...TABLE_EXPORT_ORDER.map((t) => t.name), ...EXCLUDED_TABLES]);
  const unregistered = rows.map((r) => r.table_name as string).filter((t) => !known.has(t));
  if (unregistered.length > 0) {
    throw new Error(
      `Snapshot registry is missing table(s): ${unregistered.join(", ")}. Add them to TABLE_EXPORT_ORDER in dbSnapshot.ts before taking a snapshot.`
    );
  }
}

async function getTableColumns(tableName: string): Promise<string[]> {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return rows.map((r) => r.column_name as string);
}

function toParamValue(v: any) {
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

async function batchInsert(client: PoolClient, tableName: string, columns: string[], rows: any[], batchSize = 500) {
  const colList = columns.map((c) => `"${c}"`).join(", ");
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: any[] = [];
    const placeholders = batch.map((row, rIdx) => {
      const cells = columns.map((col, cIdx) => {
        values.push(toParamValue(row[col]));
        return `$${rIdx * columns.length + cIdx + 1}`;
      });
      return `(${cells.join(",")})`;
    });
    await client.query(
      `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(",")}`,
      values
    );
  }
}

/** Inserts rows whose self-referencing FK is NULL or already inserted, wave by wave. */
async function insertSelfReferencing(client: PoolClient, tableName: string, columns: string[], rows: any[], selfRefColumn: string) {
  const remaining = [...rows];
  const insertedIds = new Set<string>();
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    const batch: any[] = [];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const refVal = remaining[i][selfRefColumn];
      if (refVal == null || insertedIds.has(refVal)) {
        batch.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }
    if (batch.length > 0) {
      await batchInsert(client, tableName, columns, batch);
      for (const row of batch) insertedIds.add(row.id);
      progress = true;
    }
  }
  if (remaining.length > 0) {
    // Shouldn't happen with well-formed data, but insert the leftovers
    // rather than silently dropping them.
    await batchInsert(client, tableName, columns, remaining);
  }
}

function snapshotFilePath(id: string) {
  return path.join(env.snapshotDir, `${id}.json.gz`);
}

async function writeSnapshotFile(filePath: string, payload: SnapshotFile) {
  await fs.mkdir(env.snapshotDir, { recursive: true });
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  await fs.writeFile(filePath, gz);
  return gz.length;
}

/** Gzip files start with the magic bytes 0x1f 0x8b. */
function isGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

async function readSnapshotFile(filePath: string): Promise<SnapshotFile> {
  const raw = await fs.readFile(filePath);
  // Snapshots we generate ourselves are always gzipped, but an uploaded
  // import may have been decompressed in transit (antivirus, browser
  // download handling, someone manually "extracting" the .gz before
  // re-uploading) — tolerate plain JSON too rather than hard-failing.
  const jsonText = isGzip(raw) ? zlib.gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(jsonText);
}

export async function createSnapshot(triggerType: string, userId?: string): Promise<string> {
  await assertRegistryComplete();

  const { rows: idRows } = await query(
    `INSERT INTO db_snapshots (created_by, trigger_type, status) VALUES ($1, $2, 'in_progress') RETURNING id`,
    [userId ?? null, triggerType]
  );
  const snapshotId = idRows[0].id as string;

  try {
    const tables: SnapshotManifest["tables"] = [];
    const data: Record<string, any[]> = {};
    const rowCounts: Record<string, number> = {};

    for (const spec of TABLE_EXPORT_ORDER) {
      const columns = await getTableColumns(spec.name);
      const colList = columns.map((c) => `"${c}"`).join(", ");
      const { rows } = await query(`SELECT ${colList} FROM "${spec.name}"`);
      data[spec.name] = rows;
      tables.push({ name: spec.name, columns });
      rowCounts[spec.name] = rows.length;
    }

    const migRows = await query(`SELECT filename FROM schema_migrations ORDER BY filename`);
    const schemaMigrations = migRows.rows.map((r) => r.filename as string);

    const manifest: SnapshotManifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      triggerType,
      schemaMigrations,
      tables
    };

    const filePath = snapshotFilePath(snapshotId);
    const size = await writeSnapshotFile(filePath, { manifest, data });

    await query(
      `UPDATE db_snapshots SET status = 'complete', file_path = $2, size_bytes = $3,
         schema_migration_count = $4, schema_last_migration = $5, table_row_counts = $6
       WHERE id = $1`,
      [
        snapshotId,
        filePath,
        size,
        schemaMigrations.length,
        schemaMigrations[schemaMigrations.length - 1] ?? null,
        JSON.stringify(rowCounts)
      ]
    );
    return snapshotId;
  } catch (err: any) {
    await query(`UPDATE db_snapshots SET status = 'failed', error_message = $2 WHERE id = $1`, [
      snapshotId,
      String(err?.message ?? err)
    ]);
    throw err;
  }
}

export async function registerImportedSnapshot(fileBuffer: Buffer, userId: string) {
  const { rows } = await query(
    `INSERT INTO db_snapshots (created_by, trigger_type, status) VALUES ($1, 'import', 'in_progress') RETURNING id`,
    [userId]
  );
  const id = rows[0].id as string;
  const filePath = snapshotFilePath(id);
  await fs.mkdir(env.snapshotDir, { recursive: true });
  await fs.writeFile(filePath, fileBuffer);

  let manifest: SnapshotManifest;
  try {
    ({ manifest } = await readSnapshotFile(filePath));
  } catch (err: any) {
    const error = `Not a valid PRISM backup file: ${String(err?.message ?? err)}`;
    await query(`UPDATE db_snapshots SET status = 'failed', error_message = $2, file_path = $3 WHERE id = $1`, [
      id,
      error,
      filePath
    ]);
    return { id, compatible: false, missing: [] as string[], error };
  }

  const compat = await checkSchemaCompatibility(manifest.schemaMigrations);
  if (!compat.compatible) {
    const error = `Missing migrations on this host: ${compat.missing.join(", ")}`;
    await query(`UPDATE db_snapshots SET status = 'failed', error_message = $2, file_path = $3 WHERE id = $1`, [
      id,
      error,
      filePath
    ]);
    return { id, compatible: false, missing: compat.missing, error };
  }

  await query(`UPDATE db_snapshots SET status = 'complete', file_path = $2, size_bytes = $3 WHERE id = $1`, [
    id,
    filePath,
    fileBuffer.length
  ]);
  return { id, compatible: true, missing: [] as string[], error: null as string | null };
}

export async function checkSchemaCompatibility(schemaMigrations: string[]) {
  const { rows } = await query(`SELECT filename FROM schema_migrations`);
  const hostMigrations = new Set(rows.map((r) => r.filename as string));
  const missing = schemaMigrations.filter((f) => !hostMigrations.has(f));
  return { compatible: missing.length === 0, missing };
}

/**
 * Restores a snapshot onto this host. Always takes a `pre_rollback_safety`
 * snapshot first, then truncates and reloads every registered table inside
 * a single transaction on one checked-out client (the shared `query()`
 * helper can hand out a different pooled connection per call, which is not
 * safe for a destructive multi-statement restore). Finally truncates
 * `session`, forcing every user — including whoever triggered this — to
 * log back in.
 */
export async function restoreSnapshot(snapshotId: string, actingUserId: string) {
  const { rows } = await query(`SELECT * FROM db_snapshots WHERE id = $1`, [snapshotId]);
  const target = rows[0];
  if (!target || target.status !== "complete" || !target.file_path) {
    throw new Error("Snapshot not found or incomplete");
  }
  const { manifest, data } = await readSnapshotFile(target.file_path);

  const safetySnapshotId = await createSnapshot("pre_rollback_safety", actingUserId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tableList = TABLE_EXPORT_ORDER.map((t) => `"${t.name}"`).join(", ");
    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

    for (const spec of TABLE_EXPORT_ORDER) {
      const tableInfo = manifest.tables.find((t) => t.name === spec.name);
      const rowsForTable = data[spec.name] || [];
      if (!tableInfo || rowsForTable.length === 0) continue;
      if (spec.selfRefColumn) {
        await insertSelfReferencing(client, spec.name, tableInfo.columns, rowsForTable, spec.selfRefColumn);
      } else {
        await batchInsert(client, spec.name, tableInfo.columns, rowsForTable);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Every session, including the one that triggered this, is now dangling.
  await query(`TRUNCATE session`);
  await query(`UPDATE db_snapshots SET restored_from_id = $2 WHERE id = $1`, [safetySnapshotId, snapshotId]);
  await query(
    `INSERT INTO audit_log (id, entity_type, entity_id, changed_by, old_value, new_value)
     VALUES (gen_random_uuid(), 'db_snapshot', $1, $2, NULL, $3)`,
    [snapshotId, actingUserId, JSON.stringify({ action: "restore", safetySnapshotId })]
  );
}

/** Keeps the newest N snapshots per trigger-type bucket, deletes the rest (file + row). */
export async function pruneOldSnapshots() {
  const buckets: [string, number][] = [
    ["weekly", env.snapshotRetentionWeekly],
    ["pre_rollback_safety", env.snapshotRetentionSafety]
  ];
  for (const [triggerType, keep] of buckets) {
    const { rows } = await query(
      `SELECT id, file_path FROM db_snapshots WHERE trigger_type = $1 AND status = 'complete'
       ORDER BY created_at DESC OFFSET $2`,
      [triggerType, keep]
    );
    for (const row of rows) {
      if (row.file_path) {
        await fs.unlink(row.file_path).catch(() => {});
      }
      await query(`DELETE FROM db_snapshots WHERE id = $1`, [row.id]);
    }
  }
}
