import dayjs from "dayjs";
import { query } from "../db.js";
import { CLOSED_TASK_STATUSES } from "../constants.js";
import { emailUser, userWantsEmail } from "./mailer.js";
import { getAppBaseUrl, isEmailLive } from "./emailSettings.js";
import { ListItem, Section, Table, renderEmail } from "./emailTemplates.js";
import { EMAIL_ROUTED_TYPES, getAdminIds } from "./notifying.js";
import { getSubordinateIds } from "./hierarchy.js";

const RED = "#dc2626";
const AMBER = "#d97706";
const BLUE = "#1d63ed";
const DUE_SOON_DAYS = 3;

const fmtDate = (d: any) => dayjs(d).format("DD MMM");

function dueBadge(date: any): { badge: string; badgeColor: string } {
  const diff = dayjs(date).startOf("day").diff(dayjs().startOf("day"), "day");
  if (diff < 0) return { badge: `${-diff}d overdue`, badgeColor: RED };
  if (diff === 0) return { badge: "due today", badgeColor: AMBER };
  return { badge: `due in ${diff}d`, badgeColor: AMBER };
}

async function activeUsersFor(onlyUserId?: string): Promise<{ id: string; name: string; role: string; email_digest_only: boolean }[]> {
  const { rows } = await query(
    `SELECT id, name, role::text AS role, email_digest_only FROM users
     WHERE is_active = true AND email IS NOT NULL AND ($1::uuid IS NULL OR id = $1)
     ORDER BY name`,
    [onlyUserId ?? null]
  );
  return rows;
}

// ── Daily digest ─────────────────────────────────────────────────

async function buildDailySections(user: { id: string; role: string; email_digest_only: boolean }, baseUrl: string): Promise<Section[]> {
  const uid = user.id;
  const dash = (id: string) => `${baseUrl}/dashboards/${id}`;
  const isAdmin = user.role === "Admin" || user.role === "SuperAdmin";

  const myTasks = await query(
    `SELECT t.id, COALESCE(t.title, t.item_details) AS label, t.target_date, t.dashboard_id, d.name AS dashboard_name
     FROM tasks t
     JOIN dashboards d ON d.id = t.dashboard_id AND d.is_active = true
     WHERE t.is_archived = false
       AND t.status::text <> 'Closed Pending Approval'
       AND NOT (t.status::text = ANY($2))
       AND EXISTS (SELECT 1 FROM task_owners tow WHERE tow.task_id = t.id AND tow.user_id = $1)
       AND t.target_date <= CURRENT_DATE + $3::int
     ORDER BY t.target_date`,
    [uid, CLOSED_TASK_STATUSES, DUE_SOON_DAYS]
  );
  const today = dayjs().startOf("day");
  const overdue: ListItem[] = [];
  const dueSoon: ListItem[] = [];
  for (const t of myTasks.rows) {
    const item = { title: t.label, meta: `${t.dashboard_name} · due ${fmtDate(t.target_date)}`, url: dash(t.dashboard_id), ...dueBadge(t.target_date) };
    (dayjs(t.target_date).isBefore(today) ? overdue : dueSoon).push(item);
  }

  const myDecisions = await query(
    `SELECT x.decision_title, x.decision_deadline, x.dashboard_id, d.name AS dashboard_name
     FROM decisions x JOIN dashboards d ON d.id = x.dashboard_id AND d.is_active = true
     WHERE x.decision_owner = $1 AND x.status::text = 'Pending' AND x.is_archived = false
       AND x.decision_deadline <= CURRENT_DATE + $2::int
     ORDER BY x.decision_deadline`,
    [uid, DUE_SOON_DAYS]
  );
  const bucket = (date: any) => (dayjs(date).isBefore(today) ? overdue : dueSoon);
  for (const x of myDecisions.rows) {
    bucket(x.decision_deadline).push({ title: `Decision: ${x.decision_title}`, meta: `${x.dashboard_name} · deadline ${fmtDate(x.decision_deadline)}`, url: dash(x.dashboard_id), ...dueBadge(x.decision_deadline) });
  }

  const myRisks = await query(
    `SELECT r.risk_title, r.target_mitigation_date, r.impact_level::text AS impact, r.dashboard_id, d.name AS dashboard_name
     FROM risks r JOIN dashboards d ON d.id = r.dashboard_id AND d.is_active = true
     WHERE r.risk_owner = $1 AND r.status::text = 'Open' AND r.is_archived = false
       AND r.target_mitigation_date IS NOT NULL AND r.target_mitigation_date <= CURRENT_DATE + $2::int
     ORDER BY r.target_mitigation_date`,
    [uid, DUE_SOON_DAYS]
  );
  for (const r of myRisks.rows) {
    bucket(r.target_mitigation_date).push({ title: `Risk mitigation: ${r.risk_title}`, meta: `${r.dashboard_name} · ${r.impact} impact · target ${fmtDate(r.target_mitigation_date)}`, url: dash(r.dashboard_id), ...dueBadge(r.target_mitigation_date) });
  }

  // Things blocked on this user.
  const waiting: ListItem[] = [];
  const closures = await query(
    `SELECT COALESCE(t.title, t.item_details) AS label, t.closure_requested_at, t.dashboard_id, d.name AS dashboard_name
     FROM tasks t JOIN dashboards d ON d.id = t.dashboard_id AND d.is_active = true
     WHERE t.created_by = $1 AND t.status::text = 'Closed Pending Approval' AND t.is_archived = false
     ORDER BY t.closure_requested_at NULLS LAST`,
    [uid]
  );
  for (const c of closures.rows) {
    const days = c.closure_requested_at ? dayjs().diff(dayjs(c.closure_requested_at), "day") : null;
    waiting.push({ title: `Approve closure: ${c.label}`, meta: `${c.dashboard_name}${days !== null ? ` · requested ${days === 0 ? "today" : `${days}d ago`}` : ""}`, url: dash(c.dashboard_id), badge: "closure", badgeColor: BLUE });
  }
  const ownedDashIds = (
    await query(
      `SELECT dashboard_id AS id FROM dashboard_owners WHERE user_id = $1
       UNION SELECT id FROM dashboards WHERE primary_owner_id = $1 OR secondary_owner_id = $1`,
      [uid]
    )
  ).rows.map((r) => r.id);
  if (ownedDashIds.length > 0) {
    const decisions = await query(
      `SELECT x.decision_title, x.decision_deadline, x.dashboard_id, d.name AS dashboard_name
       FROM decisions x JOIN dashboards d ON d.id = x.dashboard_id AND d.is_active = true
       WHERE x.dashboard_id = ANY($1) AND x.status::text = 'Pending' AND x.is_archived = false
         AND x.decision_owner <> $2 AND x.decision_deadline <= CURRENT_DATE + $3::int
       ORDER BY x.decision_deadline`,
      [ownedDashIds, uid, DUE_SOON_DAYS]
    );
    for (const x of decisions.rows) {
      waiting.push({ title: `Decide: ${x.decision_title}`, meta: `${x.dashboard_name} · deadline ${fmtDate(x.decision_deadline)}`, url: dash(x.dashboard_id), ...dueBadge(x.decision_deadline) });
    }
    const access = await query(
      `SELECT u.name, d.id AS dashboard_id, d.name AS dashboard_name, dar.created_at
       FROM dashboard_access_requests dar
       JOIN users u ON u.id = dar.user_id
       JOIN dashboards d ON d.id = dar.dashboard_id AND d.is_active = true
       WHERE dar.status::text = 'Pending' AND dar.dashboard_id = ANY($1)
       ORDER BY dar.created_at`,
      [ownedDashIds]
    );
    for (const a of access.rows) {
      waiting.push({ title: `Access request from ${a.name}`, meta: a.dashboard_name, url: dash(a.dashboard_id), badge: "access", badgeColor: BLUE });
    }
  }
  if (isAdmin) {
    const counts = await query(
      `SELECT
         (SELECT count(*)::int FROM signup_requests WHERE status::text = 'Pending') AS signups,
         (SELECT count(*)::int FROM accounts WHERE is_pending = true) AS accounts,
         (SELECT count(*)::int FROM dashboard_delete_requests WHERE status::text = 'Pending') AS deletes`
    );
    const c = counts.rows[0];
    if (c.signups > 0) waiting.push({ title: `${c.signups} pending signup request(s)`, url: `${baseUrl}/manage?tab=signup-requests`, badge: "admin", badgeColor: BLUE });
    if (c.accounts > 0) waiting.push({ title: `${c.accounts} proposed account(s) to review`, url: `${baseUrl}/manage?tab=accounts`, badge: "admin", badgeColor: BLUE });
    if (user.role === "SuperAdmin" && c.deletes > 0) waiting.push({ title: `${c.deletes} dashboard delete request(s)`, url: `${baseUrl}/manage?tab=delete-requests`, badge: "admin", badgeColor: BLUE });
  }

  // Escalations raised for this user by this morning's 02:00 run.
  const esc = await query(
    `SELECT DISTINCT ON (e.entity_id) e.message, e.dashboard_id, d.name AS dashboard_name
     FROM escalations e JOIN dashboards d ON d.id = e.dashboard_id AND d.is_active = true
     WHERE e.notified_user_id = $1 AND e.created_at > now() - interval '24 hours'
     ORDER BY e.entity_id, e.created_at DESC`,
    [uid]
  );
  const escalations: ListItem[] = esc.rows.map((e) => ({ title: e.message, meta: e.dashboard_name, url: dash(e.dashboard_id) }));

  const sections: Section[] = [
    { title: "Overdue", items: overdue, moreUrl: `${baseUrl}/personal` },
    { title: `Due in the next ${DUE_SOON_DAYS} days`, items: dueSoon, moreUrl: `${baseUrl}/personal` },
    { title: "Waiting on you", items: waiting },
    { title: "Escalations", items: escalations }
  ];

  // Digest-only users skip instant emails, so roll those notifications in here.
  if (user.email_digest_only) {
    const unread = await query(
      `SELECT n.message, n.dashboard_id FROM notifications n
       WHERE n.user_id = $1 AND n.is_read = false AND n.created_at > now() - interval '24 hours'
         AND n.type = ANY($2)
       ORDER BY n.created_at DESC`,
      [uid, EMAIL_ROUTED_TYPES]
    );
    sections.push({
      title: "New notifications (last 24h)",
      items: unread.rows.map((n) => ({ title: n.message, url: n.dashboard_id ? dash(n.dashboard_id) : `${baseUrl}/notifications` })),
      moreUrl: `${baseUrl}/notifications`
    });
  }

  return sections;
}

/**
 * Weekday-morning digest, one email per user, skipped when there's nothing
 * to report. `force` (the admin "send me a test" button) bypasses dedupe.
 */
export async function sendDailyDigests(opts: { onlyUserId?: string; force?: boolean } = {}): Promise<number> {
  if (!(await isEmailLive())) return 0;
  const baseUrl = await getAppBaseUrl();
  const date = dayjs().format("YYYY-MM-DD");
  let sent = 0;
  for (const user of await activeUsersFor(opts.onlyUserId)) {
    try {
      if (!(await userWantsEmail(user.id, "daily_digest")).ok) continue;
      const sections = await buildDailySections(user, baseUrl);
      const total = sections.reduce((n, s) => n + s.items.length, 0);
      if (total === 0) continue;
      const overdueCount = sections[0].items.length;
      const waitingCount = sections[2].items.length;
      const bits = [
        overdueCount ? `${overdueCount} overdue` : "",
        sections[1].items.length ? `${sections[1].items.length} due soon` : "",
        waitingCount ? `${waitingCount} waiting on you` : ""
      ].filter(Boolean);
      const { html, text } = renderEmail({
        heading: `Your PRISM digest — ${dayjs().format("ddd, DD MMM")}`,
        intro: `Good morning ${user.name.split(" ")[0]}. ${bits.length ? `You have ${bits.join(", ")}.` : "Here's what needs your attention."}`,
        sections,
        ctaUrl: `${baseUrl}/personal`,
        ctaLabel: "Open My Items",
        baseUrl,
        reason: "You get this digest on weekdays when something needs your attention."
      });
      const ok = await emailUser(user.id, {
        category: "daily_digest",
        subject: `Daily digest${bits.length ? `: ${bits.join(", ")}` : ""}`,
        html,
        text,
        dedupeKey: opts.force ? undefined : `digest:${user.id}:${date}`
      });
      if (ok) sent++;
    } catch (err) {
      console.error(`[digest] daily digest for ${user.id} failed:`, err);
    }
  }
  return sent;
}

// ── Weekly summary ───────────────────────────────────────────────

async function buildWeeklyTables(user: { id: string; role: string }, baseUrl: string): Promise<Table[]> {
  const tables: Table[] = [];

  const dashboards = await query(
    `WITH mine AS (
       SELECT dashboard_id AS id FROM dashboard_owners WHERE user_id = $1
       UNION SELECT id FROM dashboards WHERE primary_owner_id = $1 OR secondary_owner_id = $1
     )
     SELECT d.id, d.name,
       (SELECT count(*)::int FROM tasks t WHERE t.dashboard_id = d.id AND t.is_archived = false AND NOT (t.status::text = ANY($2))) AS open_tasks,
       (SELECT count(*)::int FROM tasks t WHERE t.dashboard_id = d.id AND t.is_archived = false AND NOT (t.status::text = ANY($2))
          AND t.status::text <> 'Closed Pending Approval' AND t.target_date < CURRENT_DATE) AS overdue,
       (SELECT count(*)::int FROM risks r WHERE r.dashboard_id = d.id AND r.is_archived = false AND r.status::text = 'Open'
          AND r.impact_level::text IN ('High', 'Critical')) AS hot_risks,
       (SELECT count(*)::int FROM decisions x WHERE x.dashboard_id = d.id AND x.is_archived = false AND x.status::text = 'Pending') AS pending_decisions,
       (SELECT count(*)::int FROM tasks t WHERE t.dashboard_id = d.id AND t.closure_approved_at > now() - interval '7 days') AS closed_7d
     FROM dashboards d JOIN mine ON mine.id = d.id
     WHERE d.is_active = true
     ORDER BY d.name`,
    [user.id, CLOSED_TASK_STATUSES]
  );
  if (dashboards.rows.length > 0) {
    tables.push({
      title: "Your dashboards",
      columns: ["Dashboard", "Open", "Overdue", "High/Crit risks", "Pending decisions", "Closed (7d)"],
      rows: dashboards.rows.map((d) => [d.name, d.open_tasks, d.overdue, d.hot_risks, d.pending_decisions, d.closed_7d]),
      rowUrls: dashboards.rows.map((d) => `${baseUrl}/dashboards/${d.id}`)
    });
  }

  const subordinates = await getSubordinateIds(user.id);
  if (subordinates.length > 0) {
    const team = await query(
      `SELECT u.name,
         count(t.id)::int AS open_tasks,
         count(t.id) FILTER (WHERE t.status::text <> 'Closed Pending Approval' AND t.target_date < CURRENT_DATE)::int AS overdue,
         count(t.id) FILTER (WHERE t.created_at < now() - interval '20 days')::int AS aging
       FROM users u
       JOIN task_owners tow ON tow.user_id = u.id
       JOIN tasks t ON t.id = tow.task_id AND t.is_archived = false AND NOT (t.status::text = ANY($2))
       JOIN dashboards d ON d.id = t.dashboard_id AND d.is_active = true
       WHERE u.id = ANY($1)
       GROUP BY u.id, u.name
       ORDER BY overdue DESC, open_tasks DESC, u.name`,
      [subordinates, CLOSED_TASK_STATUSES]
    );
    if (team.rows.length > 0) {
      tables.push({
        title: "Your team",
        columns: ["Person", "Open tasks", "Overdue", "Open > 20 days"],
        rows: team.rows.map((r) => [r.name, r.open_tasks, r.overdue, r.aging])
      });
    }
  }

  if (user.role === "Admin" || user.role === "SuperAdmin") {
    const c = (
      await query(
        `SELECT
           (SELECT count(*)::int FROM signup_requests WHERE status::text = 'Pending') AS signups,
           (SELECT count(*)::int FROM accounts WHERE is_pending = true) AS accounts,
           (SELECT count(*)::int FROM dashboard_access_requests WHERE status::text = 'Pending') AS access,
           (SELECT count(*)::int FROM dashboard_delete_requests WHERE status::text = 'Pending') AS deletes,
           (SELECT count(*)::int FROM users WHERE is_active = true AND (last_login_at IS NULL OR last_login_at < now() - interval '30 days')) AS inactive,
           (SELECT count(*)::int FROM email_outbox WHERE status = 'failed' AND created_at > now() - interval '7 days') AS failed_emails`
      )
    ).rows[0];
    const rows: (string | number)[][] = [
      ["Pending signup requests", c.signups],
      ["Proposed accounts to review", c.accounts],
      ["Pending dashboard access requests", c.access]
    ];
    if (user.role === "SuperAdmin") {
      rows.push(["Dashboard delete requests", c.deletes], ["Emails that failed to send (7d)", c.failed_emails]);
    }
    rows.push(["Active users not signed in for 30+ days", c.inactive]);
    if (rows.some((r) => Number(r[1]) > 0)) {
      tables.push({ title: "Admin queue", columns: ["Item", "Count"], rows, rowUrls: rows.map(() => `${baseUrl}/manage`) });
    }
  }

  return tables;
}

export async function sendWeeklySummaries(opts: { onlyUserId?: string; force?: boolean } = {}): Promise<number> {
  if (!(await isEmailLive())) return 0;
  const baseUrl = await getAppBaseUrl();
  const week = `${dayjs().year()}-${dayjs().format("MM-DD")}`;
  let sent = 0;
  for (const user of await activeUsersFor(opts.onlyUserId)) {
    try {
      if (!(await userWantsEmail(user.id, "weekly_summary")).ok) continue;
      const tables = await buildWeeklyTables(user, baseUrl);
      if (tables.length === 0) continue;
      const { html, text } = renderEmail({
        heading: `Weekly summary — week of ${dayjs().format("DD MMM YYYY")}`,
        intro: `Hi ${user.name.split(" ")[0]}, here's where your dashboards and team stand this week.`,
        tables,
        ctaUrl: baseUrl,
        ctaLabel: "Open PRISM",
        baseUrl,
        reason: "You get this summary every Monday because you own dashboards, manage people, or are an admin."
      });
      const ok = await emailUser(user.id, {
        category: "weekly_summary",
        subject: `Weekly summary — ${dayjs().format("DD MMM")}`,
        html,
        text,
        dedupeKey: opts.force ? undefined : `weekly:${user.id}:${week}`
      });
      if (ok) sent++;
    } catch (err) {
      console.error(`[digest] weekly summary for ${user.id} failed:`, err);
    }
  }
  return sent;
}

// ── Publishing cycle ─────────────────────────────────────────────

export function isPublishingDay(d: dayjs.Dayjs) {
  return d.date() === 15 || d.date() === d.daysInMonth();
}

/** Two days before a cycle, remind owners of child dashboards to finalise publish flags. */
export async function sendPublishingReminders(): Promise<void> {
  if (!(await isEmailLive())) return;
  const cycle = dayjs().add(2, "day");
  if (!isPublishingDay(cycle)) return;
  const baseUrl = await getAppBaseUrl();
  const { rows } = await query(
    `SELECT o.user_id, d.id, d.name, p.name AS parent_name
     FROM dashboards d
     JOIN dashboards p ON p.id = d.parent_dashboard_id
     JOIN (
       SELECT dashboard_id, user_id FROM dashboard_owners
       UNION SELECT id, primary_owner_id FROM dashboards WHERE primary_owner_id IS NOT NULL
     ) o ON o.dashboard_id = d.id
     WHERE d.is_active = true
     ORDER BY d.name`
  );
  const byUser = new Map<string, ListItem[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({ title: r.name, meta: `reports to ${r.parent_name}`, url: `${baseUrl}/dashboards/${r.id}` });
    byUser.set(r.user_id, list);
  }
  for (const [userId, items] of byUser) {
    const { html, text } = renderEmail({
      heading: `Publishing cycle on ${cycle.format("ddd, DD MMM")}`,
      intro: `The next publishing cycle runs on ${cycle.format("DD MMM")}. Please make sure the items you want visible on parent dashboards are marked "publish" and are up to date.`,
      sections: [{ title: "Your dashboards that publish upward", items }],
      baseUrl
    });
    await emailUser(userId, {
      category: "publishing",
      subject: `Publishing cycle on ${cycle.format("DD MMM")} — review publish flags`,
      html,
      text,
      dedupeKey: `pubremind:${userId}:${cycle.format("YYYY-MM-DD")}`
    });
  }
}

/** After a cycle runs, tell owners of parent dashboards that child snapshots are in. */
export async function sendPublishedNotices(): Promise<void> {
  if (!(await isEmailLive())) return;
  const baseUrl = await getAppBaseUrl();
  const date = dayjs().format("YYYY-MM-DD");
  const { rows } = await query(
    `SELECT o.user_id, p.id AS parent_id, p.name AS parent_name, string_agg(c.name, ', ' ORDER BY c.name) AS children
     FROM dashboards p
     JOIN dashboards c ON c.parent_dashboard_id = p.id AND c.is_active = true
     JOIN (
       SELECT dashboard_id, user_id FROM dashboard_owners
       UNION SELECT id, primary_owner_id FROM dashboards WHERE primary_owner_id IS NOT NULL
     ) o ON o.dashboard_id = p.id
     WHERE p.is_active = true
     GROUP BY o.user_id, p.id, p.name`
  );
  const byUser = new Map<string, ListItem[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({ title: r.parent_name, meta: `includes ${r.children}`, url: `${baseUrl}/dashboards/${r.parent_id}` });
    byUser.set(r.user_id, list);
  }
  for (const [userId, items] of byUser) {
    const { html, text } = renderEmail({
      heading: "Publishing cycle complete",
      intro: `Today's publishing cycle (${dayjs().format("DD MMM")}) has run. Published items from child dashboards are now rolled up into your dashboards, and snapshots are available.`,
      sections: [{ title: "Your dashboards", items }],
      ctaUrl: `${baseUrl}/snapshots`,
      ctaLabel: "View snapshots",
      baseUrl
    });
    await emailUser(userId, {
      category: "publishing",
      subject: "Publishing cycle complete — snapshots ready",
      html,
      text,
      dedupeKey: `pubdone:${userId}:${date}`
    });
  }
}

// ── System alerts ────────────────────────────────────────────────

/** Emails SuperAdmins when a scheduled job fails. At most once per job per day. */
export async function sendSystemAlert(job: string, err: unknown): Promise<void> {
  try {
    if (!(await isEmailLive())) return;
    const baseUrl = await getAppBaseUrl();
    const detail = err instanceof Error ? `${err.message}` : String(err);
    const { html, text } = renderEmail({
      heading: `Scheduled job failed: ${job}`,
      intro: `The "${job}" job failed at ${dayjs().format("DD MMM YYYY HH:mm")}.\nError: ${detail.slice(0, 500)}\nCheck the backend container logs for details.`,
      baseUrl,
      showPrefsLink: false
    });
    for (const id of await getAdminIds(true)) {
      await emailUser(id, {
        category: "system",
        subject: `ALERT: ${job} failed`,
        html,
        text,
        dedupeKey: `sysalert:${job}:${id}:${dayjs().format("YYYY-MM-DD")}`
      });
    }
  } catch (e) {
    console.error("[digest] failed to send system alert:", e);
  }
}
