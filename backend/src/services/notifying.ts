import { v4 as uuid } from "uuid";
import { query } from "../db.js";
import { EmailCategory, emailUser } from "./mailer.js";
import { renderEmail } from "./emailTemplates.js";
import { getAppBaseUrl } from "./emailSettings.js";

export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "task_closure_requested"
  | "task_closure_approved"
  | "task_overdue"
  | "dashboard_assigned"
  | "decision_assigned"
  | "decision_pending"
  | "decision_approved"
  | "risk_critical"
  | "access_requested"
  | "access_reviewed"
  | "delete_requested"
  | "delete_reviewed"
  | "signup_requested"
  | "account_proposed"
  | "account_reviewed"
  | "escalation";

// Which notification types also go out by email (instantly, subject to the
// user's preferences). Types not listed here stay in-app only — overdue
// tasks and escalations are covered by the daily digest instead of one
// email per item per day.
const EMAIL_ROUTING: Partial<Record<NotificationType, { category: EmailCategory; subject: string; cta: string }>> = {
  task_assigned: { category: "assignments", subject: "You were assigned a task", cta: "View task" },
  dashboard_assigned: { category: "assignments", subject: "Dashboard access updated", cta: "Open dashboard" },
  decision_assigned: { category: "assignments", subject: "You were assigned a decision", cta: "View decision" },
  task_closure_requested: { category: "approvals", subject: "Task closure needs your approval", cta: "Review task" },
  decision_pending: { category: "approvals", subject: "New decision pending approval", cta: "Review decision" },
  access_requested: { category: "approvals", subject: "Dashboard access request", cta: "Review request" },
  task_closure_approved: { category: "outcomes", subject: "Task closure approved", cta: "View task" },
  decision_approved: { category: "outcomes", subject: "Decision approved", cta: "View decision" },
  access_reviewed: { category: "outcomes", subject: "Your access request was reviewed", cta: "Open PRISM" },
  delete_reviewed: { category: "outcomes", subject: "Your delete request was reviewed", cta: "Open PRISM" },
  account_reviewed: { category: "outcomes", subject: "Your proposed account was reviewed", cta: "Open PRISM" },
  risk_critical: { category: "critical_risks", subject: "Critical risk raised", cta: "View risk" },
  delete_requested: { category: "admin_requests", subject: "Dashboard delete request", cta: "Review in Admin" },
  signup_requested: { category: "admin_requests", subject: "New signup request", cta: "Review in Admin" },
  account_proposed: { category: "admin_requests", subject: "New account proposed", cta: "Review in Admin" }
};

/** Types that normally email instantly — digest-only users get these rolled into their digest. */
export const EMAIL_ROUTED_TYPES = Object.keys(EMAIL_ROUTING) as NotificationType[];

export async function notifyUser(params: {
  userId: string;
  message: string;
  type: NotificationType;
  entityType?: string;
  entityId?: string;
  dashboardId?: string;
  /** App path for the email's button, e.g. "/manage". Defaults to the dashboard, else /notifications. */
  link?: string;
  /** Overrides the default email subject for this type. */
  emailSubject?: string;
}) {
  const { userId, message, type, entityType, entityId, dashboardId } = params;
  await query(
    `INSERT INTO notifications (id, user_id, message, type, entity_type, entity_id, dashboard_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuid(), userId, message, type, entityType ?? null, entityId ?? null, dashboardId ?? null]
  );

  const route = EMAIL_ROUTING[type];
  if (!route) return;
  // Email is best-effort: a mail problem must never fail the API request
  // that produced the notification.
  try {
    const baseUrl = await getAppBaseUrl();
    const path = params.link ?? (dashboardId ? `/dashboards/${dashboardId}` : "/notifications");
    const subject = params.emailSubject ?? route.subject;
    const { html, text } = renderEmail({
      heading: subject,
      intro: message,
      ctaUrl: `${baseUrl}${path}`,
      ctaLabel: route.cta,
      baseUrl
    });
    await emailUser(userId, { category: route.category, subject, html, text });
  } catch (err) {
    console.error(`[notify] email for ${type} to ${userId} failed to queue:`, err);
  }
}

/** notifyUser for several recipients, de-duplicated, skipping the actor. */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  params: Omit<Parameters<typeof notifyUser>[0], "userId">,
  actorUserId?: string
) {
  const recipients = [...new Set(userIds.filter((u): u is string => !!u))].filter((u) => u !== actorUserId);
  for (const userId of recipients) {
    await notifyUser({ ...params, userId });
  }
}

/** Every owner of a dashboard (dashboard_owners plus legacy primary/secondary columns). */
export async function getDashboardOwnerIds(dashboardId: string): Promise<string[]> {
  const { rows } = await query(
    `SELECT user_id AS id FROM dashboard_owners WHERE dashboard_id = $1
     UNION
     SELECT primary_owner_id FROM dashboards WHERE id = $1 AND primary_owner_id IS NOT NULL
     UNION
     SELECT secondary_owner_id FROM dashboards WHERE id = $1 AND secondary_owner_id IS NOT NULL`,
    [dashboardId]
  );
  return rows.map((r) => r.id);
}

export async function getAdminIds(superAdminOnly = false): Promise<string[]> {
  const { rows } = await query(
    superAdminOnly
      ? `SELECT id FROM users WHERE role::text = 'SuperAdmin' AND is_active = true`
      : `SELECT id FROM users WHERE role::text IN ('Admin', 'SuperAdmin') AND is_active = true`
  );
  return rows.map((r) => r.id);
}
