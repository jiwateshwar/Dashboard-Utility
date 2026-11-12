import dayjs from "dayjs";
import { query } from "../db.js";
import { emailUser } from "./mailer.js";
import { getAppBaseUrl, isEmailLive } from "./emailSettings.js";
import { renderEmail } from "./emailTemplates.js";

const TZ = () => process.env.NOTIFY_TZ || "Asia/Kolkata";

/**
 * A dashboard's subscribers: its owners (dashboard_owners plus the primary /
 * secondary owner columns) and everyone given view access. Admins see every
 * dashboard but are only subscribed where they're an owner or were given access.
 */
export const SUBSCRIBERS_SQL = `
  SELECT dashboard_id, user_id FROM dashboard_owners
  UNION SELECT id, primary_owner_id FROM dashboards WHERE primary_owner_id IS NOT NULL
  UNION SELECT id, secondary_owner_id FROM dashboards WHERE secondary_owner_id IS NOT NULL
  UNION SELECT dashboard_id, user_id FROM dashboard_access WHERE can_view = true`;

/** Monday (YYYY-MM-DD, local business time) of the week `weeksAgo` weeks before this one. */
export function weekStart(weeksAgo = 0): string {
  // dayjs().day(): 0 = Sunday. Shift so Monday is the start of the week.
  const now = dayjs(new Date().toLocaleString("en-US", { timeZone: TZ() }));
  const monday = now.subtract((now.day() + 6) % 7, "day").startOf("day");
  return monday.subtract(weeksAgo, "week").format("YYYY-MM-DD");
}

export type WeeklyVisits = { week_start: string; unique_visitors: number; views: number };

/** Unique visitors and total views per week for one dashboard, oldest first, including empty weeks. */
export async function weeklyVisits(dashboardId: string, weeks = 8): Promise<WeeklyVisits[]> {
  const from = weekStart(weeks - 1);
  const { rows } = await query(
    `SELECT to_char(date_trunc('week', visit_date), 'YYYY-MM-DD') AS week_start,
            count(DISTINCT user_id)::int AS unique_visitors,
            sum(view_count)::int AS views
     FROM dashboard_visits
     WHERE dashboard_id = $1 AND visit_date >= $2::date
     GROUP BY 1`,
    [dashboardId, from]
  );
  const byWeek = new Map(rows.map((r: any) => [r.week_start, r]));
  return Array.from({ length: weeks }, (_, i) => {
    const ws = weekStart(weeks - 1 - i);
    const r: any = byWeek.get(ws);
    return { week_start: ws, unique_visitors: r?.unique_visitors ?? 0, views: r?.views ?? 0 };
  });
}

/** Per-dashboard visitor counts for a given week and the week before it. */
export async function visitsByDashboard(weekStartDate: string, dashboardIds?: string[]) {
  const prev = dayjs(weekStartDate).subtract(1, "week").format("YYYY-MM-DD");
  const { rows } = await query(
    `SELECT d.id AS dashboard_id, d.name,
            count(DISTINCT v.user_id) FILTER (WHERE v.visit_date >= $1::date AND v.visit_date < $1::date + 7)::int AS unique_visitors,
            COALESCE(sum(v.view_count) FILTER (WHERE v.visit_date >= $1::date AND v.visit_date < $1::date + 7), 0)::int AS views,
            count(DISTINCT v.user_id) FILTER (WHERE v.visit_date >= $2::date AND v.visit_date < $1::date)::int AS prev_unique_visitors,
            (SELECT count(*)::int FROM (${SUBSCRIBERS_SQL}) s WHERE s.dashboard_id = d.id) AS subscribers
     FROM dashboards d
     LEFT JOIN dashboard_visits v ON v.dashboard_id = d.id AND v.visit_date >= $2::date AND v.visit_date < $1::date + 7
     WHERE d.is_active = true AND ($3::uuid[] IS NULL OR d.id = ANY($3::uuid[]))
     GROUP BY d.id, d.name
     ORDER BY unique_visitors DESC, d.name`,
    [weekStartDate, prev, dashboardIds ?? null]
  );
  return rows as { dashboard_id: string; name: string; unique_visitors: number; views: number; prev_unique_visitors: number; subscribers: number }[];
}

function trend(now: number, before: number) {
  if (before === 0) return now > 0 ? "new" : "—";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "no change" : `${pct > 0 ? "+" : ""}${pct}%`;
}

/**
 * Monday email to each subscriber: how many unique people viewed each of
 * their dashboards last week (Mon–Sun), with the change from the week before.
 * One email per person covering all their subscribed dashboards.
 */
export async function sendDashboardVisitorReports(opts: { onlyUserId?: string; force?: boolean } = {}): Promise<number> {
  if (!(await isEmailLive())) return 0;
  const lastWeek = weekStart(1);
  const weekLabel = `${dayjs(lastWeek).format("DD MMM")} – ${dayjs(lastWeek).add(6, "day").format("DD MMM YYYY")}`;
  const stats = new Map((await visitsByDashboard(lastWeek)).map((s) => [s.dashboard_id, s]));
  const baseUrl = await getAppBaseUrl();

  const { rows: subs } = await query(
    `SELECT s.user_id, array_agg(DISTINCT s.dashboard_id) AS dashboard_ids
     FROM (${SUBSCRIBERS_SQL}) s
     JOIN users u ON u.id = s.user_id AND u.is_active = true AND u.email IS NOT NULL
     JOIN dashboards d ON d.id = s.dashboard_id AND d.is_active = true
     WHERE ($1::uuid IS NULL OR s.user_id = $1)
     GROUP BY s.user_id`,
    [opts.onlyUserId ?? null]
  );

  let sent = 0;
  for (const sub of subs) {
    try {
      const mine = (sub.dashboard_ids as string[]).map((id) => stats.get(id)).filter(Boolean) as ReturnType<typeof stats.get>[];
      if (mine.length === 0) continue;
      mine.sort((a, b) => b!.unique_visitors - a!.unique_visitors || a!.name.localeCompare(b!.name));
      const total = mine.reduce((n, s) => n + s!.unique_visitors, 0);
      const { html, text } = renderEmail({
        heading: `Dashboard visitors — week of ${dayjs(lastWeek).format("DD MMM")}`,
        intro: `Here's how many people viewed your dashboards last week (${weekLabel}). A visitor is counted once per dashboard, however many times they opened it.`,
        tables: [{
          title: "Your dashboards",
          columns: ["Dashboard", "Unique visitors", "vs week before", "Page views", "Subscribers"],
          rows: mine.map((s) => [s!.name, s!.unique_visitors, trend(s!.unique_visitors, s!.prev_unique_visitors), s!.views, s!.subscribers]),
          rowUrls: mine.map((s) => `${baseUrl}/dashboards/${s!.dashboard_id}`)
        }],
        ctaUrl: baseUrl,
        ctaLabel: "Open PRISM",
        baseUrl,
        reason: "You get this report every Monday because you own or have access to these dashboards."
      });
      const ok = await emailUser(sub.user_id, {
        category: "dashboard_analytics",
        subject: `Dashboard visitors last week: ${total} across ${mine.length} dashboard${mine.length === 1 ? "" : "s"}`,
        html,
        text,
        dedupeKey: opts.force ? undefined : `visitors:${sub.user_id}:${lastWeek}`
      });
      if (ok) sent++;
    } catch (err) {
      console.error(`[analytics] visitor report for ${sub.user_id} failed:`, err);
    }
  }
  return sent;
}
