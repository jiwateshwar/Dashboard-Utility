import dayjs from "dayjs";

type SnapshotContent = {
  summary: {
    tasks: { total: number; open: number; inProgress: number };
    risks: { total: number; red: number };
    decisions: { total: number; pending: number };
    generatedAt: string;
  };
  tasks: any[];
  openTasks?: any[];
  risks: any[];
  decisions: any[];
  closedTasks?: any[];
  closedRisks?: any[];
  closedDecisions?: any[];
};

const ACCENT = "#1d63ed";
const BORDER = "#e6e9ef";
const MUTED = "#6b7280";
const BG = "#f7f8fa";
const CARD_BG = "#ffffff";
const TEXT = "#1f2937";

function sectionHeader(title: string, count?: number) {
  const badge = count !== undefined
    ? `<span style="margin-left:8px;font-weight:400;font-size:11px;color:${MUTED};text-transform:none;letter-spacing:0;">(${count})</span>`
    : "";
  return `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};
                padding-bottom:6px;border-bottom:1px solid ${BORDER};margin:24px 0 12px;">
      ${title}${badge}
    </div>`;
}

function categoryHeader(name: string) {
  return `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;
                color:${MUTED};padding:10px 0 4px;">
      ${name}
    </div>`;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    "Open":                     { bg: "rgba(245,166,35,0.12)",  color: "#d97706" },
    "In Progress":              { bg: "rgba(46,189,133,0.12)",  color: "#059669" },
    "Closed Pending Approval":  { bg: "rgba(245,166,35,0.12)",  color: "#d97706" },
    "Closed Accepted":          { bg: "rgba(46,189,133,0.12)",  color: "#059669" },
    "Red":    { bg: "rgba(198,40,40,0.12)",  color: "#c62828" },
    "Amber":  { bg: "rgba(245,166,35,0.12)", color: "#d97706" },
    "Green":  { bg: "rgba(46,189,133,0.12)", color: "#059669" },
    "Critical": { bg: "rgba(198,40,40,0.12)", color: "#c62828" },
    "High":     { bg: "rgba(198,40,40,0.12)", color: "#c62828" },
    "Medium":   { bg: "rgba(245,166,35,0.12)", color: "#d97706" },
    "Low":      { bg: "rgba(46,189,133,0.12)", color: "#059669" },
    "Pending":  { bg: "rgba(245,166,35,0.12)", color: "#d97706" },
    "Approved": { bg: "rgba(46,189,133,0.12)", color: "#059669" },
    "Rejected": { bg: "rgba(198,40,40,0.12)", color: "#c62828" },
    "Deferred": { bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
  };
  const s = map[status] || { bg: "rgba(107,114,128,0.12)", color: "#6b7280" };
  return `<span style="font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;
                       background:${s.bg};color:${s.color};white-space:nowrap;">${status}</span>`;
}

function fmt(d?: string) {
  if (!d) return "—";
  return dayjs(d.slice(0, 10)).format("DD MMM YYYY");
}

function taskRow(t: any) {
  return `
    <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${t.item_details ?? "—"}</div>
        <div style="font-size:12px;color:${MUTED};">
          ${t.account_name ?? "—"} &nbsp;·&nbsp; ${t.owner_name ?? "—"}
          ${t.target_date ? ` &nbsp;·&nbsp; Due ${fmt(t.target_date)}` : ""}
        </div>
      </div>
      <div style="flex-shrink:0;">${statusBadge(t.status)}</div>
    </div>`;
}

function riskRow(r: any) {
  return `
    <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${r.risk_title ?? "—"}</div>
        <div style="font-size:12px;color:${MUTED};">
          ${r.account_name ?? "—"} &nbsp;·&nbsp; ${r.owner_name ?? "—"}
          &nbsp;·&nbsp; Impact: ${r.impact_level ?? "—"} &nbsp;·&nbsp; Probability: ${r.probability ?? "—"}
          ${r.target_mitigation_date ? ` &nbsp;·&nbsp; Target: ${fmt(r.target_mitigation_date)}` : ""}
        </div>
        ${r.risk_description ? `<div style="font-size:12px;color:${MUTED};margin-top:3px;">${r.risk_description}</div>` : ""}
      </div>
      <div style="flex-shrink:0;">${statusBadge(r.impact_level)}</div>
    </div>`;
}

function decisionRow(d: any) {
  return `
    <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${d.decision_title ?? "—"}</div>
        <div style="font-size:12px;color:${MUTED};">
          ${d.account_name ?? "—"} &nbsp;·&nbsp; ${d.owner_name ?? "—"}
          ${d.decision_deadline ? ` &nbsp;·&nbsp; Deadline: ${fmt(d.decision_deadline)}` : ""}
          ${d.impact_area ? ` &nbsp;·&nbsp; ${d.impact_area}` : ""}
        </div>
        ${d.decision_context ? `<div style="font-size:12px;color:${MUTED};margin-top:3px;">${d.decision_context}</div>` : ""}
      </div>
      <div style="flex-shrink:0;">${statusBadge(d.status)}</div>
    </div>`;
}

function card(content: string) {
  return `<div style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px 20px;margin-bottom:16px;">${content}</div>`;
}

function summaryCard(content: SnapshotContent, date: string) {
  const { tasks, risks, decisions } = content.summary;
  return card(`
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};margin-bottom:4px;">Tasks</div>
        <div style="font-size:22px;font-weight:700;color:${TEXT};">${tasks.total}</div>
        <div style="font-size:12px;color:${MUTED};">${tasks.open} Open &nbsp;·&nbsp; ${tasks.inProgress} In Progress</div>
      </div>
      <div style="width:1px;background:${BORDER};"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};margin-bottom:4px;">Risks</div>
        <div style="font-size:22px;font-weight:700;color:${TEXT};">${risks.total}</div>
        <div style="font-size:12px;color:${MUTED};">${risks.red} Critical / High</div>
      </div>
      <div style="width:1px;background:${BORDER};"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};margin-bottom:4px;">Decisions</div>
        <div style="font-size:22px;font-weight:700;color:${TEXT};">${decisions.total}</div>
        <div style="font-size:12px;color:${MUTED};">${decisions.pending} Pending</div>
      </div>
    </div>
    <div style="font-size:11px;color:${MUTED};margin-top:12px;">Snapshot generated ${dayjs(content.summary.generatedAt).format("DD MMM YYYY HH:mm")}</div>
  `);
}

function tasksSection(openTasks: any[]) {
  if (openTasks.length === 0) {
    return card(`${sectionHeader("Tasks", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No open tasks.</div>`);
  }

  // Group by category
  const byCategory: Record<string, any[]> = {};
  for (const t of openTasks) {
    const cat = t.category_name ?? "Uncategorised";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }

  const rows = Object.entries(byCategory).map(([cat, items]) =>
    categoryHeader(cat) + items.map(taskRow).join("")
  ).join("");

  return card(sectionHeader("Tasks", openTasks.length) + rows);
}

function risksSection(risks: any[]) {
  if (risks.length === 0) {
    return card(`${sectionHeader("Risks", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No active risks.</div>`);
  }
  return card(sectionHeader("Risks", risks.length) + risks.map(riskRow).join(""));
}

function decisionsSection(decisions: any[]) {
  const open = decisions.filter((d) => d.status !== "Approved" && d.status !== "Rejected");
  if (open.length === 0) {
    return card(`${sectionHeader("Decisions Needed", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No pending decisions.</div>`);
  }
  return card(sectionHeader("Decisions Needed", open.length) + open.map(decisionRow).join(""));
}

function closedSection(closedTasks: any[], closedRisks: any[], closedDecisions: any[]) {
  const total = closedTasks.length + closedRisks.length + closedDecisions.length;
  if (total === 0) return "";

  let inner = sectionHeader("Closed in Last 45 Days", total);

  if (closedTasks.length > 0) {
    inner += categoryHeader("Tasks");
    inner += closedTasks.map((t) => `
      <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${t.item_details ?? "—"}</div>
          <div style="font-size:12px;color:${MUTED};">${t.account_name ?? "—"} &nbsp;·&nbsp; ${t.owner_name ?? "—"} &nbsp;·&nbsp; Closed ${fmt(t.closure_approved_at)}</div>
        </div>
        ${statusBadge("Closed Accepted")}
      </div>`).join("");
  }

  if (closedRisks.length > 0) {
    inner += categoryHeader("Risks");
    inner += closedRisks.map((r) => `
      <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${r.risk_title ?? "—"}</div>
          <div style="font-size:12px;color:${MUTED};">${r.account_name ?? "—"} &nbsp;·&nbsp; ${r.owner_name ?? "—"} &nbsp;·&nbsp; Closed ${fmt(r.closed_at)}</div>
        </div>
        ${statusBadge("Closed Accepted")}
      </div>`).join("");
  }

  if (closedDecisions.length > 0) {
    inner += categoryHeader("Decisions");
    inner += closedDecisions.map((d) => `
      <div style="border-top:1px solid ${BORDER};padding:10px 0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:500;font-size:14px;color:${TEXT};margin-bottom:3px;">${d.decision_title ?? "—"}</div>
          <div style="font-size:12px;color:${MUTED};">${d.account_name ?? "—"} &nbsp;·&nbsp; ${d.owner_name ?? "—"} &nbsp;·&nbsp; Approved ${fmt(d.decision_date)}</div>
        </div>
        ${statusBadge("Approved")}
      </div>`).join("");
  }

  return card(inner);
}

export function buildEml(params: { dashboardName: string; date: string; content: SnapshotContent }) {
  const { dashboardName, date, content } = params;
  const subject = `[PRISM] ${dashboardName} - Snapshot - ${date}`;

  const openTasks = content.openTasks ?? content.tasks ?? [];
  const risks = content.risks ?? [];
  const decisions = content.decisions ?? [];
  const closedTasks = content.closedTasks ?? [];
  const closedRisks = content.closedRisks ?? [];
  const closedDecisions = content.closedDecisions ?? [];

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Inter,Arial,sans-serif;background:${BG};color:${TEXT};padding:24px;margin:0;">
  <div style="max-width:760px;margin:0 auto;">

    <!-- Header card -->
    <div style="background:${CARD_BG};border:1px solid ${BORDER};border-left:3px solid ${ACCENT};border-radius:8px;padding:20px 24px;margin-bottom:16px;">
      <h2 style="color:${ACCENT};margin:0 0 4px;font-size:20px;">${dashboardName}</h2>
      <div style="font-size:13px;color:${MUTED};">Snapshot &nbsp;·&nbsp; ${fmt(date)}</div>
    </div>

    <!-- Summary -->
    ${summaryCard(content, date)}

    <!-- Tasks -->
    ${tasksSection(openTasks)}

    <!-- Risks -->
    ${risksSection(risks)}

    <!-- Decisions -->
    ${decisionsSection(decisions)}

    <!-- Closed items -->
    ${closedSection(closedTasks, closedRisks, closedDecisions)}

    <div style="font-size:11px;color:${MUTED};text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid ${BORDER};">
      Generated by PRISM &nbsp;·&nbsp; ${dayjs().format("DD MMM YYYY HH:mm")}
    </div>
  </div>
</body>
</html>`;

  return `Subject: ${subject}\n` +
    `MIME-Version: 1.0\n` +
    `Content-Type: text/html; charset=UTF-8\n` +
    `Date: ${dayjs().format("ddd, DD MMM YYYY HH:mm:ss ZZ")}\n\n` +
    html;
}
