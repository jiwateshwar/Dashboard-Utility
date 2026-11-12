import { useEffect, useState } from "react";
import { api } from "../api";
import { TaskFilterBar } from "../components/TaskFilterBar";
import { EditableDecisionTable, EditableRiskTable, EditableTaskTable } from "../components/WorkTables";
import { EscalatedToYou } from "../components/EscalatedToYou";
import { ApprovalQueue } from "../components/ApprovalQueue";

// My Work: one view (tables with Edit in place, like the dashboard page),
// plus escalations raised to me and closures waiting on my approval.
type Tab = "work" | "escalations" | "approvals";

function daysPastDue(targetDate?: string): number {
  if (!targetDate) return -999;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - new Date(targetDate.slice(0, 10)).getTime()) / 86400000);
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{ marginLeft: 6, background: "rgba(245,166,35,0.18)", color: "#f5a623", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
      {count}
    </span>
  );
}

export default function PersonalPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("work");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [displayedTasks, setDisplayedTasks] = useState<any[]>([]);
  const [escalationCount, setEscalationCount] = useState(0);

  const reload = () => api("/personal").then(setData);

  useEffect(() => {
    Promise.all([api("/personal"), api("/accounts"), api("/users"), api("/auth/me")]).then(([personal, accts, usrs, meRes]) => {
      setData(personal); setAccounts(accts); setUsers(usrs); setMe(meRes);
    });
    // Count for the tab badge and KPI (the list itself loads in its tab).
    api("/escalations/mine").then((r: any[]) => setEscalationCount(r.length)).catch(() => {});
  }, []);

  if (!data) return <div className="dashboard-shell"><div>Loading...</div></div>;

  const openTasks = data.tasks.filter((t: any) => t.status !== "Closed Accepted" && t.status !== "Dropped");
  const overdueTasks = data.tasks.filter((t: any) =>
    t.target_date && !["Closed Accepted", "Closed Pending Approval", "Dropped"].includes(t.status) && daysPastDue(t.target_date) > 0);
  const activeRisks = data.risks.filter((r: any) => r.status !== "Closed" && r.status !== "Mitigated");
  const pendingDecisions = data.decisions.filter((d: any) => d.status === "Pending");
  const common = { accounts, users, me, onChanged: reload };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-header">
        <h1>My Work</h1>
      </div>

      <div className="kpi-strip" style={{ marginTop: 12 }}>
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#1d63ed" }}>{openTasks.length}</div><div className="kpi-label">Open Tasks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#e53935" }}>{overdueTasks.length}</div><div className="kpi-label">Overdue Tasks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#2ebd85" }}>{activeRisks.length}</div><div className="kpi-label">Active Risks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#f5a623" }}>{pendingDecisions.length}</div><div className="kpi-label">Decisions Pending</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#6366f1" }}>{data.pendingApprovals.length}</div><div className="kpi-label">Awaiting My Approval</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#f5a623" }}>{escalationCount}</div><div className="kpi-label">Escalated To Me</div></div>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab${tab === "work" ? " active" : ""}`} onClick={() => setTab("work")}>My Work</button>
        <button className={`tab${tab === "escalations" ? " active" : ""}`} onClick={() => setTab("escalations")}>
          Escalations<CountBadge count={escalationCount} />
        </button>
        <button className={`tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
          Pending Approvals<CountBadge count={data.pendingApprovals.length} />
        </button>
      </div>

      {tab === "work" && (
        <>
          <TaskFilterBar tasks={data.tasks} users={users} accounts={accounts} onFilteredChange={setDisplayedTasks} />
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Tasks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{displayedTasks.length} {displayedTasks.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableTaskTable tasks={displayedTasks} {...common} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Decisions</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{data.decisions.length} {data.decisions.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableDecisionTable decisions={data.decisions} {...common} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>My Risks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{data.risks.length} {data.risks.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableRiskTable risks={data.risks} {...common} />
          </div>
        </>
      )}

      {tab === "escalations" && <EscalatedToYou onCount={setEscalationCount} />}

      {tab === "approvals" && <ApprovalQueue items={data.pendingApprovals} onChanged={reload} />}
    </div>
  );
}
