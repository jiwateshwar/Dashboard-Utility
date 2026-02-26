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

export async function query(text: string, params: unknown[] = []) {
  const result = await pool.query(text, params);
  return result as { rows: any[] };
}
