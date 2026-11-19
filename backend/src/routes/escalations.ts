import { Router } from "express";
import { v4 as uuid } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";
import { getUserRole, isAdminRole, isDashboardOwner } from "../services/permission.js";
import { notifyUser } from "../services/notifying.js";
import { enqueueEmail, processOutbox, userWantsEmail } from "../services/mailer.js";
import { getAppBaseUrl, isEmailLive } from "../services/emailSettings.js";
import { renderEmail } from "../services/emailTemplates.js";
import { logAudit } from "../services/auditing.js";

const router = Router();
router.use(requireAuth);

async function requireOwnerOrAdmin(userId: string, dashboardId: string) {
  const role = await getUserRole(userId);
  if (isAdminRole(role)) return true;
  return isDashboardOwner(userId, dashboardId);
}

router.get("/rules", async (req, res) => {
  const { dashboard_id } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const ok = await requireOwnerOrAdmin(req.session.userId!, dashboard_id);
  if (!ok) return res.status(403).json({ error: "Not allowed" });

  const { rows } = await query(
    `SELECT * FROM escalation_rules WHERE dashboard_id = $1 ORDER BY created_at DESC`,
    [dashboard_id]
  );
  res.json(rows);
});

router.post("/rules", async (req, res) => {
  const { dashboard_id, entity_type, rule_name, condition_json, is_active } = req.body as any;
  if (!dashboard_id || !entity_type || !rule_name || !condition_json) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const ok = await requireOwnerOrAdmin(req.session.userId!, dashboard_id);
  if (!ok) return res.status(403).json({ error: "Not allowed" });

  const id = uuid();
  await query(
    `INSERT INTO escalation_rules (id, dashboard_id, entity_type, rule_name, condition_json, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, dashboard_id, entity_type, rule_name, JSON.stringify(condition_json), is_active ?? true]
  );
  res.json({ id });
});

router.patch("/rules/:id", async (req, res) => {
  const { id } = req.params;
  const rule = await query(`SELECT dashboard_id FROM escalation_rules WHERE id = $1`, [id]);
  if (rule.rows.length === 0) return res.status(404).json({ error: "Not found" });

  const dashboardId = rule.rows[0].dashboard_id as string;
  const ok = await requireOwnerOrAdmin(req.session.userId!, dashboardId);
  if (!ok) return res.status(403).json({ error: "Not allowed" });

  const { rule_name, condition_json, is_active } = req.body as any;
  await query(
    `UPDATE escalation_rules
     SET rule_name = COALESCE($2, rule_name),
         condition_json = COALESCE($3, condition_json),
         is_active = COALESCE($4, is_active)
     WHERE id = $1`,
    [id, rule_name || null, condition_json ? JSON.stringify(condition_json) : null, is_active]
  );
  res.json({ ok: true });
});

// Escalation rows joined to the item they're about: its name, status, and the
// people it is currently waiting on (task owners — or the creator once closure
// is pending their approval — the risk owner, or the decision owner).
// `base` selects the escalation rows first (filtered / de-duplicated / limited),
// so the joins and the per-item lookups only run for the rows actually shown —
// escalations re-fire nightly, so the raw table grows by thousands of rows a month.
const enriched = (base: string) => `
  SELECT e.*, d.name AS dashboard_name,
         COALESCE(t.title, t.item_details, r.risk_title, dc.decision_title) AS label,
         COALESCE(t.status::text, r.status::text, dc.status::text) AS entity_status,
         COALESCE(t.target_date, r.target_mitigation_date, dc.decision_deadline) AS due_date,
         CASE e.entity_type
           WHEN 'Task' THEN CASE WHEN t.status = 'Closed Pending Approval' THEN ARRAY[t.created_by]
                                 ELSE COALESCE((SELECT array_agg(o.user_id) FROM task_owners o WHERE o.task_id = t.id), ARRAY[t.owner_id]) END
           WHEN 'Risk' THEN ARRAY[r.risk_owner]
           WHEN 'Decision' THEN ARRAY[dc.decision_owner]
         END AS pending_user_ids,
         (SELECT max(u.requested_at) FROM escalation_update_requests u WHERE u.entity_id = e.entity_id) AS last_update_requested_at,
         (SELECT count(*)::int FROM escalation_update_requests u WHERE u.entity_id = e.entity_id) AS reminder_count
  FROM (${base}) e
  JOIN dashboards d ON d.id = e.dashboard_id
  LEFT JOIN tasks t ON e.entity_type = 'Task' AND t.id = e.entity_id
  LEFT JOIN risks r ON e.entity_type = 'Risk' AND r.id = e.entity_id
  LEFT JOIN decisions dc ON e.entity_type = 'Decision' AND dc.id = e.entity_id`;

// Update requests can be repeated as often as needed; this only stops an
// accidental double-send (double click, two tabs) from emailing twice.
const DUPLICATE_GUARD_SECONDS = 60;

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
/** 2 → "Second", 11 → "11th". */
function ordinal(n: number): string {
  if (n <= ORDINALS.length) return ORDINALS[n - 1];
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
/** Button / subject label for the next request, given how many were already sent. */
function reminderLabel(alreadySent: number): string {
  return alreadySent === 0 ? "Request update" : `${ordinal(alreadySent + 1)} reminder`;
}

function isOpen(entityType: string, status: string | null) {
  if (!status) return false; // item deleted
  if (entityType === "Task") return !["Closed Accepted", "Dropped"].includes(status);
  if (entityType === "Risk") return !["Closed", "Mitigated"].includes(status);
  if (entityType === "Decision") return status === "Pending";
  return false;
}

/** Adds pending people's names, how many reminders were sent, and the next button label. */
async function present(rows: any[]) {
  const ids = [...new Set(rows.flatMap((r) => r.pending_user_ids ?? []).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const u = await query(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    for (const x of u.rows) names.set(x.id, x.name);
  }
  return rows.map((r) => {
    const open = isOpen(r.entity_type, r.entity_status);
    const sent = Number(r.reminder_count ?? 0);
    return {
      ...r,
      is_open: open,
      pending: (r.pending_user_ids ?? []).filter(Boolean).map((id: string) => ({ id, name: names.get(id) ?? "Unknown" })),
      can_request_update: open,
      reminder_count: sent,
      next_request_label: reminderLabel(sent)
    };
  });
}

router.get("/logs", async (req, res) => {
  const { dashboard_id } = req.query as any;
  if (!dashboard_id) return res.status(400).json({ error: "dashboard_id required" });
  const ok = await requireOwnerOrAdmin(req.session.userId!, dashboard_id);
  if (!ok) return res.status(403).json({ error: "Not allowed" });

  const { rows } = await query(
    `${enriched(`SELECT * FROM escalations WHERE dashboard_id = $1 ORDER BY created_at DESC LIMIT 500`)}
     ORDER BY e.created_at DESC`,
    [dashboard_id]
  );
  res.json(await present(rows));
});

// Escalations raised *to* the signed-in user (e.g. a manager whose report's
// task is aging), latest per item, open items only. Escalations re-fire
// nightly, so without the de-dupe one task would appear once per day.
router.get("/mine", async (req, res) => {
  const userId = req.session.userId!;
  const { rows } = await query(
    `${enriched(`SELECT DISTINCT ON (entity_type, entity_id) * FROM escalations
                 WHERE notified_user_id = $1 AND created_at >= now() - interval '30 days'
                 ORDER BY entity_type, entity_id, created_at DESC`)}
     ORDER BY e.created_at DESC`,
    [userId]
  );
  res.json((await present(rows)).filter((r) => r.is_open));
});

// Emails the people an escalated item is waiting on, with the requester in CC
// and as Reply-To, asking them to update it. Also notifies them in-app.
// Can be repeated; each repeat is labelled "Second reminder", "Third reminder"...
router.post("/:id/request-update", async (req, res) => {
  const userId = req.session.userId!;
  const note = String((req.body as any)?.note ?? "").trim().slice(0, 1000);

  const { rows } = await query(enriched(`SELECT * FROM escalations WHERE id = $1`), [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: "Escalation not found" });
  const [esc] = await present(rows);

  const allowed = esc.notified_user_id === userId || (await requireOwnerOrAdmin(userId, esc.dashboard_id));
  if (!allowed) return res.status(403).json({ error: "Only the person this was escalated to, a dashboard owner, or an admin can request an update" });
  if (!esc.is_open) return res.status(400).json({ error: "This item is already closed — no update needed" });
  const lastAt = esc.last_update_requested_at ? new Date(esc.last_update_requested_at) : null;
  if (lastAt && Date.now() - lastAt.getTime() < DUPLICATE_GUARD_SECONDS * 1000) {
    return res.status(429).json({ error: "A reminder for this item was sent less than a minute ago" });
  }
  const sentBefore = Number(esc.reminder_count ?? 0);
  const number = sentBefore + 1; // this request's number: 1 = first, 2 = second reminder...
  const isRepeat = number > 1;
  const reminderWord = ordinal(number).toLowerCase(); // "second"
  const subjectPrefix = isRepeat ? `${ordinal(number)} reminder — ` : "";
  const lastText = lastAt ? lastAt.toISOString().slice(0, 10) : null;

  const recipients = esc.pending.filter((p: any) => p.id !== userId);
  if (recipients.length === 0) return res.status(400).json({ error: "There's nobody else this item is waiting on" });

  const requester = (await query(`SELECT name, email FROM users WHERE id = $1`, [userId])).rows[0];
  const kind = String(esc.entity_type).toLowerCase();
  const pendingOnApproval = esc.entity_type === "Task" && esc.entity_status === "Closed Pending Approval";
  const ask = pendingOnApproval
    ? `Its closure is waiting for your approval — please approve it or reopen it in PRISM.`
    : `Please update it in PRISM (status, target date or details), or reply to this email.`;

  // In-app for each person (works even while email is off).
  for (const p of recipients) {
    await notifyUser({
      userId: p.id,
      message: isRepeat
        ? `${ordinal(number)} reminder: ${requester.name} is still waiting for an update on ${kind} "${esc.label}" in ${esc.dashboard_name}.${note ? ` Note: ${note}` : ""}`
        : `${requester.name} asked for an update on ${kind} "${esc.label}" in ${esc.dashboard_name}.${note ? ` Note: ${note}` : ""}`,
      type: "update_requested",
      entityType: esc.entity_type,
      entityId: esc.entity_id,
      dashboardId: esc.dashboard_id
    });
  }

  // One email to everyone it's pending on, requester in CC.
  let emailed: string[] = [];
  if (await isEmailLive()) {
    const addresses: string[] = [];
    for (const p of recipients) {
      const want = await userWantsEmail(p.id, "update_requests");
      if (want.ok && want.email) { addresses.push(want.email); emailed.push(p.name); }
    }
    if (addresses.length > 0) {
      const baseUrl = await getAppBaseUrl();
      const itemUrl = esc.entity_type === "Task" ? `${baseUrl}/tasks/${esc.entity_id}` : `${baseUrl}/dashboards/${esc.dashboard_id}`;
      const dueText = esc.due_date ? new Date(esc.due_date).toISOString().slice(0, 10) : "—";
      const { html, text } = renderEmail({
        heading: `${subjectPrefix}Update requested: ${esc.label}`,
        intro: [
          `Hi ${recipients.map((p: any) => p.name.split(" ")[0]).join(", ")},`,
          isRepeat
            ? `This is the ${reminderWord} reminder: ${requester.name} is still waiting for an update on this ${kind} in ${esc.dashboard_name}${lastText ? ` (last asked on ${lastText})` : ""}. It was escalated because: ${esc.message}.`
            : `${requester.name} has asked for an update on this ${kind} in ${esc.dashboard_name}. It was escalated because: ${esc.message}.`,
          ...(note ? [`Note from ${requester.name.split(" ")[0]}: "${note}"`] : []),
          ask
        ].join("\n"),
        tables: [{
          title: "Item",
          columns: ["Item", "Dashboard", "Status", esc.entity_type === "Decision" ? "Deadline" : "Due", "Waiting on"],
          rows: [[esc.label, esc.dashboard_name, esc.entity_status, dueText, esc.pending.map((p: any) => p.name).join(", ")]],
          rowUrls: [itemUrl]
        }],
        ctaUrl: itemUrl,
        ctaLabel: `Update ${kind}`,
        baseUrl,
        reason: `${requester.name} is copied on this email.`,
        replyNote: requester.email ? `Replies go to ${requester.name}.` : undefined,
        showPrefsLink: false
      });
      await enqueueEmail({
        to: addresses.join(", "),
        cc: requester.email ? [requester.email] : undefined,
        replyTo: requester.email || undefined,
        userId: null,
        category: "update_requests",
        subject: `${subjectPrefix}Update requested: ${esc.label}`,
        html,
        text,
        dedupeKey: `update-req:${esc.entity_id}:${number}`
      });
      void processOutbox();
    }
  }

  await query(`UPDATE escalations SET update_requested_at = now(), update_requested_by = $2 WHERE id = $1`, [esc.id, userId]);
  await query(
    `INSERT INTO escalation_update_requests (escalation_id, entity_type, entity_id, requested_by, note) VALUES ($1, $2, $3, $4, $5)`,
    [esc.id, esc.entity_type, esc.entity_id, userId, note || null]
  );
  await logAudit({ entityType: esc.entity_type, entityId: esc.entity_id, changedBy: userId, oldValue: null,
    newValue: { action: "update_requested", reminder_number: number, recipients: recipients.map((p: any) => p.name), note: note || undefined } });

  const what = isRepeat ? `${ordinal(number)} reminder sent to` : "Update requested from";
  res.json({
    ok: true,
    notified: recipients.map((p: any) => p.name),
    emailed,
    reminder_count: number,
    next_request_label: reminderLabel(number),
    message: emailed.length
      ? `${what} ${emailed.join(", ")} by email (you're in CC).`
      : `${what} ${recipients.map((p: any) => p.name).join(", ")} in PRISM (email is off or they have no email address).`
  });
});

export default router;
