import dayjs from "dayjs";

type SnapshotContent = {
  summary: {
    tasks: { total: number; open: number; inProgress: number };
    risks: { total: number; red: number };
    decisions: { total: number; pending: number };
    generatedAt: string;
  };
  tasks: any[];
  risks: any[];
  decisions: any[];
};

function table(rows: any[], columns: { key: string; label: string }[]) {
  const header = columns.map((c) => `<th>${c.label}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((c) => `<td>${row[c.key] ?? ""}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">` +
    `<thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildEml(params: { dashboardName: string; date: string; content: SnapshotContent }) {
  const { dashboardName, date, content } = params;
  const subject = `[PRISM] ${dashboardName}  Snapshot  ${date}`;

  const html = `
  <html>
    <body style="font-family:Arial, sans-serif;">
      <h2>${dashboardName} Snapshot</h2>
      <p><strong>Date:</strong> ${date}</p>
      <h3>Executive Summary</h3>
      <ul>
        <li>Tasks: ${content.summary.tasks.total} (Open ${content.summary.tasks.open}, In Progress ${content.summary.tasks.inProgress})</li>
        <li>Risks: ${content.summary.risks.total} (Red ${content.summary.risks.red})</li>
        <li>Decisions: ${content.summary.decisions.total} (Pending ${content.summary.decisions.pending})</li>
      </ul>
      <h3>Open Tasks</h3>
      ${table(content.tasks, [
        { key: "item_details", label: "Task" },
        { key: "status", label: "Status" },
        { key: "rag_status", label: "RAG" },
        { key: "owner_name", label: "Owner" },
        { key: "target_date", label: "Target Date" }
      ])}
      <h3>Risk Register</h3>
      ${table(content.risks, [
        { key: "risk_title", label: "Risk" },
        { key: "impact_level", label: "Impact" },
        { key: "probability", label: "Probability" },
        { key: "status", label: "Status" },
        { key: "owner_name", label: "Owner" }
      ])}
      <h3>Decisions Needed</h3>
      ${table(content.decisions, [
        { key: "decision_title", label: "Decision" },
        { key: "status", label: "Status" },
        { key: "decision_deadline", label: "Deadline" },
        { key: "owner_name", label: "Owner" }
      ])}
    </body>
  </html>`;

  return `Subject: ${subject}\n` +
    `MIME-Version: 1.0\n` +
    `Content-Type: text/html; charset=UTF-8\n` +
    `Date: ${dayjs().format("ddd, DD MMM YYYY HH:mm:ss ZZ")}\n\n` +
    html;
}
