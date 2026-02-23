import pg from "pg";
import { env } from "./utils/env.js";
const { Pool } = pg;
export const pool = new Pool({
    connectionString: env.databaseUrl
});
export async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result;
}
