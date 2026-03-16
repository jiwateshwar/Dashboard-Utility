import pg from "pg";
import { env } from "./utils/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 25,
  min: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000
});

// Prevent idle client errors (e.g. Postgres restart) from crashing the process.
// pg-pool emits 'error' on the pool when an idle connection is terminated
// externally (admin shutdown, DB restart). Without this handler Node.js throws
// an unhandled error event and the process dies.
pool.on("error", (err) => {
  console.error("[pg-pool] idle client error:", err.message);
});

export async function query(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return result as { rows: any[] };
}
