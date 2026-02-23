import { v4 as uuid } from "uuid";
import { pool } from "../db.js";

async function run() {
  const adminId = uuid();
  const now = new Date();

  await pool.query(
    `INSERT INTO users (id, name, email, manager_id, level, is_active, created_at, updated_at, role)
     VALUES ($1, $2, $3, NULL, 1, true, $4, $4, 'Admin')
     ON CONFLICT (email) DO NOTHING`,
    [adminId, "Admin User", "admin@prism.local", now]
  );

  await pool.query(
    `INSERT INTO accounts (id, account_name, account_type, region, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, $5, $5)
     ON CONFLICT (account_name) DO NOTHING`,
    [uuid(), "Global Account", "Enterprise", "NA", now]
  );

  console.log("Seed complete");
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
