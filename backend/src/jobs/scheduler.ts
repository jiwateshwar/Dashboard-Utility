import cron from "node-cron";
import dayjs from "dayjs";
import { runArchival } from "../services/archiver.js";
import { runEscalations } from "../services/escalation.js";
import { query } from "../db.js";
import { buildSnapshotContent } from "../services/publishing.js";
import { v4 as uuid } from "uuid";

async function runPublishingCycle() {
  const today = dayjs();
  const is15th = today.date() === 15;
  const isLastDay = today.date() === today.daysInMonth();
  if (!is15th && !isLastDay) return;

  const dashboards = await query(`SELECT id FROM dashboards WHERE is_active = true`);
  for (const dash of dashboards.rows) {
    const content = await buildSnapshotContent(dash.id);
    await query(
      `INSERT INTO publishing_snapshots (id, dashboard_id, cycle_date, content_json)
       VALUES ($1, $2, $3, $4)`,
      [uuid(), dash.id, today.format("YYYY-MM-DD"), JSON.stringify(content)]
    );
  }
}

cron.schedule("0 2 * * *", async () => {
  await runArchival();
  await runEscalations();
  await runPublishingCycle();
});
