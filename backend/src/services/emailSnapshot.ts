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

const BORDER = "#e6e9ef";
const MUTED = "#6b7280";
const BG = "#f7f8fa";
const CARD_BG = "#ffffff";
const TEXT = "#1f2937";
const ROW_ALT = "#f9fafb";

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

function fmt(d?: string | Date) {
  if (!d) return "—";
  return dayjs(d).format("DD MMM YYYY");
}

function toDateStr(d?: string | Date): string {
  if (!d) return "";
  return dayjs(d).format("YYYY-MM-DD");
}

function card(content: string) {
  return `<div style="background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:16px 20px;margin-bottom:16px;">${content}</div>`;
}

// ── Row renderers returning <tr> elements ─────────────────────────────────────

function taskRow(t: any, idx: number): string {
  const bg = idx % 2 === 1 ? ROW_ALT : CARD_BG;
  const desc = t.title
    ? `<div style="font-weight:700;font-size:13px;color:${TEXT};margin-bottom:2px;">${t.title}</div>
       <div style="font-size:13px;color:${TEXT};">${t.item_details ?? "—"}</div>`
    : `<div style="font-size:14px;font-weight:500;color:${TEXT};">${t.item_details ?? "—"}</div>`;
  return `
    <tr>
      <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;">${desc}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.account_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.owner_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">${t.target_date ? fmt(t.target_date) : "—"}</td>
      <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge(t.status)}</td>
    </tr>`;
}

function riskRow(r: any, idx: number): string {
  const bg = idx % 2 === 1 ? ROW_ALT : CARD_BG;
  const desc = r.risk_description
    ? `<div style="font-size:14px;font-weight:500;color:${TEXT};margin-bottom:2px;">${r.risk_title ?? "—"}</div>
       <div style="font-size:12px;color:${MUTED};">${r.risk_description}</div>`
    : `<div style="font-size:14px;font-weight:500;color:${TEXT};">${r.risk_title ?? "—"}</div>`;
  return `
    <tr>
      <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;">${desc}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${r.account_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${r.owner_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${r.probability ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">${r.target_mitigation_date ? fmt(r.target_mitigation_date) : "—"}</td>
      <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge(r.impact_level)}</td>
    </tr>`;
}

function decisionRow(d: any, idx: number): string {
  const bg = idx % 2 === 1 ? ROW_ALT : CARD_BG;
  const desc = d.decision_context
    ? `<div style="font-size:14px;font-weight:500;color:${TEXT};margin-bottom:2px;">${d.decision_title ?? "—"}</div>
       <div style="font-size:12px;color:${MUTED};">${d.decision_context}</div>`
    : `<div style="font-size:14px;font-weight:500;color:${TEXT};">${d.decision_title ?? "—"}</div>`;
  return `
    <tr>
      <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;">${desc}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${d.account_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${d.owner_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">${d.decision_deadline ? fmt(d.decision_deadline) : "—"}</td>
      <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge(d.status)}</td>
    </tr>`;
}

// ── Table header rows ─────────────────────────────────────────────────────────

function taskTableHead() {
  const th = (label: string, align = "left", extra = "") =>
    `<th style="text-align:${align};font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px ${align === "right" ? "8px" : "0"};letter-spacing:0.04em;border-bottom:1px solid ${BORDER};${extra}">${label}</th>`;
  return `<tr>
    ${th("Description", "left", "padding-right:8px;")}
    ${th("Account")}
    ${th("Owner")}
    ${th("Due")}
    ${th("Status", "right")}
  </tr>`;
}

function riskTableHead() {
  const th = (label: string, align = "left", extra = "") =>
    `<th style="text-align:${align};font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px ${align === "right" ? "8px" : "0"};letter-spacing:0.04em;border-bottom:1px solid ${BORDER};${extra}">${label}</th>`;
  return `<tr>
    ${th("Risk", "left", "padding-right:8px;")}
    ${th("Account")}
    ${th("Owner")}
    ${th("Probability")}
    ${th("Target")}
    ${th("Impact", "right")}
  </tr>`;
}

function decisionTableHead() {
  const th = (label: string, align = "left", extra = "") =>
    `<th style="text-align:${align};font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px ${align === "right" ? "8px" : "0"};letter-spacing:0.04em;border-bottom:1px solid ${BORDER};${extra}">${label}</th>`;
  return `<tr>
    ${th("Decision", "left", "padding-right:8px;")}
    ${th("Account")}
    ${th("Owner")}
    ${th("Deadline")}
    ${th("Status", "right")}
  </tr>`;
}

// ── Category label row spanning all columns ───────────────────────────────────

function catRow(name: string, colspan: number) {
  return `<tr><td colspan="${colspan}" style="padding:0;">
    <div style="background:#eff6ff;border-left:3px solid #1d63ed;padding:6px 10px;margin:10px 0 2px;border-radius:3px;
                font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#1d63ed;">${name}</div>
  </td></tr>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function summaryCard(content: SnapshotContent) {
  const { tasks, risks, decisions } = content.summary;
  const kpi = (label: string, value: number, sub: string) => `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${MUTED};margin-bottom:4px;">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${TEXT};">${value}</div>
    <div style="font-size:12px;color:${MUTED};">${sub}</div>`;
  const divider = `<td style="width:1px;padding:0 20px;"><div style="width:1px;height:100%;background:${BORDER};min-height:48px;"></div></td>`;
  return card(`
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;padding:0;">${kpi("Tasks", tasks.total, `${tasks.open} Open &nbsp;·&nbsp; ${tasks.inProgress} In Progress`)}</td>
        ${divider}
        <td style="vertical-align:top;padding:0;">${kpi("Risks", risks.total, `${risks.red} Critical / High`)}</td>
        ${divider}
        <td style="vertical-align:top;padding:0;">${kpi("Decisions", decisions.total, `${decisions.pending} Pending`)}</td>
      </tr>
    </table>
    <div style="font-size:11px;color:${MUTED};margin-top:12px;">Snapshot generated ${dayjs(content.summary.generatedAt).format("DD MMM YYYY HH:mm")}</div>
  `);
}

function tasksSection(openTasks: any[]) {
  if (openTasks.length === 0) {
    return card(`${sectionHeader("Tasks", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No open tasks.</div>`);
  }

  const byCategory: Record<string, any[]> = {};
  for (const t of openTasks) {
    const cat = t.category_name ?? "Uncategorised";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(t);
  }

  let rowIdx = 0;
  const rows = Object.entries(byCategory).map(([cat, items]) =>
    catRow(cat, 5) + items.map((t) => taskRow(t, rowIdx++)).join("")
  ).join("");

  const table = `<table style="width:100%;border-collapse:collapse;">
    <thead>${taskTableHead()}</thead>
    <tbody>${rows}</tbody>
  </table>`;

  return card(sectionHeader("Tasks", openTasks.length) + table);
}

function risksSection(risks: any[]) {
  if (risks.length === 0) {
    return card(`${sectionHeader("Risks", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No active risks.</div>`);
  }

  const table = `<table style="width:100%;border-collapse:collapse;">
    <thead>${riskTableHead()}</thead>
    <tbody>${risks.map((r, i) => riskRow(r, i)).join("")}</tbody>
  </table>`;

  return card(sectionHeader("Risks", risks.length) + table);
}

function decisionsSection(decisions: any[]) {
  const open = decisions.filter((d) => d.status !== "Approved" && d.status !== "Rejected");
  if (open.length === 0) {
    return card(`${sectionHeader("Decisions Needed", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No pending decisions.</div>`);
  }

  const table = `<table style="width:100%;border-collapse:collapse;">
    <thead>${decisionTableHead()}</thead>
    <tbody>${open.map((d, i) => decisionRow(d, i)).join("")}</tbody>
  </table>`;

  return card(sectionHeader("Decisions Needed", open.length) + table);
}

function plannedFortnightSection(openTasks: any[]) {
  const today = dayjs().format("YYYY-MM-DD");
  const in14 = dayjs().add(14, "day").format("YYYY-MM-DD");
  const items = openTasks
    .filter((t) => {
      if (!t.target_date || (t.status !== "Open" && t.status !== "In Progress")) return false;
      const due = toDateStr(t.target_date);
      return due >= today && due <= in14;
    })
    .sort((a: any, b: any) => toDateStr(a.target_date).localeCompare(toDateStr(b.target_date)));

  if (items.length === 0) {
    return card(`${sectionHeader("Planned for Coming Fortnight", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No open tasks due in the next 14 days.</div>`);
  }

  const table = `<table style="width:100%;border-collapse:collapse;">
    <thead>${taskTableHead()}</thead>
    <tbody>${items.map((t: any, i: number) => taskRow(t, i)).join("")}</tbody>
  </table>`;
  return card(sectionHeader("Planned for Coming Fortnight", items.length) + table);
}

function recentlyClosedSection(closedTasks: any[]) {
  const ago14 = dayjs().subtract(14, "day").format("YYYY-MM-DD");
  const items = closedTasks
    .filter((t) => {
      const closedAt = t.closure_approved_at ?? t.updated_at;
      if (!closedAt) return false;
      return toDateStr(closedAt) >= ago14;
    })
    .sort((a: any, b: any) => {
      const ad = toDateStr(a.closure_approved_at ?? a.updated_at);
      const bd = toDateStr(b.closure_approved_at ?? b.updated_at);
      return bd.localeCompare(ad);
    });

  if (items.length === 0) {
    return card(`${sectionHeader("Closed in Last 14 Days", 0)}<div style="font-size:13px;color:${MUTED};padding:8px 0;">No tasks closed in the last 14 days.</div>`);
  }

  let rowIdx = 0;
  const rows = items.map((t: any) => {
    const bg = rowIdx++ % 2 === 1 ? ROW_ALT : CARD_BG;
    const desc = t.title
      ? `<div style="font-weight:700;font-size:13px;color:${TEXT};margin-bottom:2px;">${t.title}</div>
         <div style="font-size:13px;color:${TEXT};">${t.item_details ?? "—"}</div>`
      : `<div style="font-size:14px;font-weight:500;color:${TEXT};">${t.item_details ?? "—"}</div>`;
    const closedAt = t.closure_approved_at ?? t.updated_at;
    return `<tr>
      <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;">${desc}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.account_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.owner_name ?? "—"}</td>
      <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">${closedAt ? fmt(closedAt) : "—"}</td>
      <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge("Closed Accepted")}</td>
    </tr>`;
  }).join("");

  const thead = `<tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px 0;letter-spacing:0.04em;border-bottom:1px solid ${BORDER};">Description</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px;letter-spacing:0.04em;border-bottom:1px solid ${BORDER};">Account</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px;letter-spacing:0.04em;border-bottom:1px solid ${BORDER};">Owner</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:${MUTED};padding:0 8px 8px;letter-spacing:0.04em;border-bottom:1px solid ${BORDER};">Closed</th>
    <th style="text-align:right;font-size:11px;font-weight:600;color:${MUTED};padding:0 0 8px 8px;letter-spacing:0.04em;border-bottom:1px solid ${BORDER};">Status</th>
  </tr>`;

  const table = `<table style="width:100%;border-collapse:collapse;">
    <thead>${thead}</thead>
    <tbody>${rows}</tbody>
  </table>`;
  return card(sectionHeader("Closed in Last 14 Days", items.length) + table);
}

function closedSection(closedTasks: any[], closedRisks: any[], closedDecisions: any[]) {
  const total = closedTasks.length + closedRisks.length + closedDecisions.length;
  if (total === 0) return "";

  let inner = sectionHeader("Closed in Last 45 Days", total);
  let rowIdx = 0;

  if (closedTasks.length > 0) {
    const rows = closedTasks.map((t) => {
      const bg = rowIdx++ % 2 === 1 ? ROW_ALT : CARD_BG;
      const desc = t.title
        ? `<div style="font-weight:700;font-size:13px;color:${TEXT};margin-bottom:2px;">${t.title}</div>
           <div style="font-size:13px;color:${TEXT};">${t.item_details ?? "—"}</div>`
        : `<div style="font-size:14px;font-weight:500;color:${TEXT};">${t.item_details ?? "—"}</div>`;
      return `<tr>
        <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;">${desc}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.account_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${t.owner_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">Closed ${fmt(t.closure_approved_at)}</td>
        <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge("Closed Accepted")}</td>
      </tr>`;
    }).join("");
    inner += `<table style="width:100%;border-collapse:collapse;">${catRow("Tasks", 5)}<tbody>${rows}</tbody></table>`;
  }

  if (closedRisks.length > 0) {
    const rows = closedRisks.map((r, _i) => {
      const bg = rowIdx++ % 2 === 1 ? ROW_ALT : CARD_BG;
      return `<tr>
        <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;font-size:14px;font-weight:500;color:${TEXT};">${r.risk_title ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${r.account_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${r.owner_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">Closed ${fmt(r.closed_at)}</td>
        <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge("Closed Accepted")}</td>
      </tr>`;
    }).join("");
    inner += `<table style="width:100%;border-collapse:collapse;">${catRow("Risks", 5)}<tbody>${rows}</tbody></table>`;
  }

  if (closedDecisions.length > 0) {
    const rows = closedDecisions.map((d) => {
      const bg = rowIdx++ % 2 === 1 ? ROW_ALT : CARD_BG;
      return `<tr>
        <td style="background:${bg};padding:10px 8px 10px 0;vertical-align:top;font-size:14px;font-weight:500;color:${TEXT};">${d.decision_title ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${d.account_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};">${d.owner_name ?? "—"}</td>
        <td style="background:${bg};padding:10px 8px;vertical-align:top;font-size:13px;color:${MUTED};white-space:nowrap;">Approved ${fmt(d.decision_date)}</td>
        <td style="background:${bg};padding:10px 0 10px 8px;vertical-align:top;text-align:right;">${statusBadge("Approved")}</td>
      </tr>`;
    }).join("");
    inner += `<table style="width:100%;border-collapse:collapse;">${catRow("Decisions", 5)}<tbody>${rows}</tbody></table>`;
  }

  return card(inner);
}

export function buildEml(params: { dashboardName: string; dashboardDescription?: string; parentDashboardName?: string; date: string; content: SnapshotContent }) {
  const { dashboardName, dashboardDescription, parentDashboardName, date, content } = params;
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
    <div style="background:#0f172a;background:linear-gradient(90deg,#0f172a,#1d63ed);border-radius:8px;padding:18px 20px;margin-bottom:16px;">
      ${parentDashboardName ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">↑ Reports to: ${parentDashboardName}</div>` : ""}
      <h2 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">${dashboardName}</h2>
      ${dashboardDescription ? `<div style="font-size:12px;color:#dbeafe;margin-top:6px;">${dashboardDescription}</div>` : ""}
      <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Snapshot &nbsp;·&nbsp; ${fmt(date)}</div>
    </div>

    <!-- Summary -->
    ${summaryCard(content)}

    <!-- Tasks -->
    ${tasksSection(openTasks)}

    <!-- Risks -->
    ${risksSection(risks)}

    <!-- Decisions -->
    ${decisionsSection(decisions)}

    <!-- Planned for Coming Fortnight -->
    ${plannedFortnightSection(openTasks)}

    <!-- Closed in Last 14 Days -->
    ${recentlyClosedSection(closedTasks)}

    <!-- Closed items (45 days) -->
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
