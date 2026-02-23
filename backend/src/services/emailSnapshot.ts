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

function table(rows: any[], columns: { key: string; label: string }[]) {
  const header = columns.map((c) => `<th style="background:#f3f4f6;color:#6b7280;font-size:13px;text-align:left;padding:8px;border-bottom:1px solid #e6e9ef;">${c.label}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((c) => `<td style="font-size:13px;padding:8px;border-bottom:1px solid #e6e9ef;">${row[c.key] ?? ""}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;border:1px solid #e6e9ef;border-radius:6px;overflow:hidden;">` +
    `<thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildEml(params: { dashboardName: string; date: string; content: SnapshotContent }) {
  const { dashboardName, date, content } = params;
  const subject = `[PRISM] ${dashboardName} - Snapshot - ${date}`;

  const html = `
  <html>
    <body style="font-family:Inter, Arial, sans-serif;background:#f7f8fa;color:#1f2937;padding:24px;">
      <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e6e9ef;border-radius:8px;padding:24px;">
        <h2 style="color:#1d63ed;margin:0 0 8px;">${dashboardName} Snapshot</h2>
        <p style="margin:0 0 16px;color:#6b7280;"><strong>Date:</strong> ${date}</p>
        <h3 style="margin:16px 0 8px;">Executive Summary</h3>
        <ul style="margin:0 0 16px;color:#1f2937;">
          <li>Tasks: ${content.summary.tasks.total} (Open ${content.summary.tasks.open}, In Progress ${content.summary.tasks.inProgress})</li>
          <li>Risks: ${content.summary.risks.total} (Red ${content.summary.risks.red})</li>
          <li>Decisions: ${content.summary.decisions.total} (Pending ${content.summary.decisions.pending})</li>
        </ul>
        <h3 style="margin:16px 0 8px;">Open Tasks</h3>
        ${table(content.openTasks || content.tasks, [
          { key: "item_details", label: "Task" },
          { key: "status", label: "Status" },
          { key: "rag_status", label: "RAG" },
          { key: "owner_name", label: "Owner" },
          { key: "target_date", label: "Target Date" }
        ])}
        <h3 style="margin:16px 0 8px;">Risk Register</h3>
        ${table(content.risks, [
          { key: "risk_title", label: "Risk" },
          { key: "impact_level", label: "Impact" },
          { key: "probability", label: "Probability" },
          { key: "status", label: "Status" },
          { key: "owner_name", label: "Owner" }
        ])}
        <h3 style="margin:16px 0 8px;">Decisions Needed</h3>
        ${table(content.decisions, [
          { key: "decision_title", label: "Decision" },
          { key: "status", label: "Status" },
          { key: "decision_deadline", label: "Deadline" },
          { key: "owner_name", label: "Owner" }
        ])}
        <h3 style="margin:16px 0 8px;">Closed (Last 45 Days)</h3>
        <h4 style="margin:8px 0;">Tasks</h4>
        ${table(content.closedTasks || [], [
          { key: "item_details", label: "Task" },
          { key: "closure_approved_at", label: "Closed Date" },
          { key: "owner_name", label: "Owner" }
        ])}
        <h4 style="margin:8px 0;">Risks</h4>
        ${table(content.closedRisks || [], [
          { key: "risk_title", label: "Risk" },
          { key: "closed_at", label: "Closed Date" },
          { key: "owner_name", label: "Owner" }
        ])}
        <h4 style="margin:8px 0;">Decisions</h4>
        ${table(content.closedDecisions || [], [
          { key: "decision_title", label: "Decision" },
          { key: "decision_date", label: "Approved Date" },
          { key: "owner_name", label: "Owner" }
        ])}
      </div>
    </body>
  </html>`;

  return `Subject: ${subject}\n` +
    `MIME-Version: 1.0\n` +
    `Content-Type: text/html; charset=UTF-8\n` +
    `Date: ${dayjs().format("ddd, DD MMM YYYY HH:mm:ss ZZ")}\n\n` +
    html;
}
