import { useEffect, useState } from "react";
import { api } from "../api";
import { TaskFilterBar } from "../components/TaskFilterBar";
import { PendingApprovalRow } from "../components/PendingApprovalRow";
import { EditableDecisionTable, EditableRiskTable, EditableTaskTable } from "../components/WorkTables";
import { EscalatedToYou } from "../components/EscalatedToYou";

// Team View: my reports' work in one view (tables with Edit in place, like the
// dashboard page), escalations raised to me about it, and their closure requests.
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

export default function TeamPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("work");
  const [showOverdue, setShowOverdue] = useState(false);
  const [showRed, setShowRed] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [displayedTasks, setDisplayedTasks] = useState<any[]>([]);
  const [escalationCount, setEscalationCount] = useState(0);

  const reload = () => api("/team").then(setData);

  useEffect(() => {
    reload();
    api("/accounts").then(setAccounts);
    api("/users").then(setUsers);
    api("/auth/me").then(setMe).catch(() => {});
    api("/escalations/mine").then((r: any[]) => setEscalationCount(r.length)).catch(() => {});
  }, []);

  if (!data) return <div className="dashboard-shell"><div>Loading...</div></div>;

  const pendingApprovals: any[] = data.pendingApprovals ?? [];
  const isOverdue = (date?: string) => !!date && daysPastDue(date) > 0;
  const closedTask = (s: string) => ["Closed Accepted", "Closed Pending Approval", "Dropped"].includes(s);

  const filteredTasks = data.tasks.filter((t: any) => {
    if (showRed && (closedTask(t.status) || !isOverdue(t.target_date))) return false;
    if (showOverdue && !isOverdue(t.target_date)) return false;
    return true;
  });
  const filteredRisks = data.risks.filter((r: any) => {
    if (showRed && r.impact_level !== "Critical") return false;
    if (showOverdue && !isOverdue(r.target_mitigation_date)) return false;
    return true;
  });
  const filteredDecisions = data.decisions.filter((d: any) => !showOverdue || isOverdue(d.decision_deadline));

  const overdueTasks = data.tasks.filter((t: any) => !closedTask(t.status) && isOverdue(t.target_date));
  const activeRisks = data.risks.filter((r: any) => r.status !== "Closed" && r.status !== "Mitigated");
  const pendingDecisions = data.decisions.filter((d: any) => d.status === "Pending");
  const common = { accounts, users, me, onChanged: reload };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-header">
        <h1>Team View</h1>
      </div>

      <div className="kpi-strip" style={{ marginTop: 12 }}>
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#1d63ed" }}>{data.tasks.length}</div><div className="kpi-label">Team Tasks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#e53935" }}>{overdueTasks.length}</div><div className="kpi-label">Overdue Tasks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#2ebd85" }}>{activeRisks.length}</div><div className="kpi-label">Active Risks</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#f5a623" }}>{pendingDecisions.length}</div><div className="kpi-label">Decisions Pending</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#6366f1" }}>{pendingApprovals.length}</div><div className="kpi-label">Team Closures Pending</div></div>
          <div className="kpi-card"><div className="kpi-value" style={{ color: "#f5a623" }}>{escalationCount}</div><div className="kpi-label">Escalated To Me</div></div>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab${tab === "work" ? " active" : ""}`} onClick={() => setTab("work")}>Team Work</button>
        <button className={`tab${tab === "escalations" ? " active" : ""}`} onClick={() => setTab("escalations")}>
          Escalations<CountBadge count={escalationCount} />
        </button>
        <button className={`tab${tab === "approvals" ? " active" : ""}`} onClick={() => setTab("approvals")}>
          Pending Approvals<CountBadge count={pendingApprovals.length} />
        </button>
      </div>

      {tab === "work" && (
        <>
          <div className="inline-actions" style={{ marginBottom: 12 }}>
            <label className="badge"><input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} /> Overdue Only</label>
            <label className="badge"><input type="checkbox" checked={showRed} onChange={(e) => setShowRed(e.target.checked)} /> Overdue Tasks / Critical Risks</label>
          </div>

          <TaskFilterBar tasks={filteredTasks} users={users} accounts={accounts} onFilteredChange={setDisplayedTasks} />
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Tasks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{displayedTasks.length} {displayedTasks.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableTaskTable tasks={displayedTasks} {...common} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Decisions</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{filteredDecisions.length} {filteredDecisions.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableDecisionTable decisions={filteredDecisions} {...common} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Risks</h3>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{filteredRisks.length} {filteredRisks.length === 1 ? "item" : "items"}</span>
            </div>
            <EditableRiskTable risks={filteredRisks} {...common} />
          </div>
        </>
      )}

      {tab === "escalations" && <EscalatedToYou onCount={setEscalationCount} />}

      {tab === "approvals" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>Team closures pending approval</h3>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{pendingApprovals.length} {pendingApprovals.length === 1 ? "item" : "items"}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
            Your reports' tasks waiting for the creator to approve closure. Ones waiting on you also appear under My Work → Pending Approvals.
          </div>
          {pendingApprovals.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No pending approvals</div>
          ) : (
            pendingApprovals.map((t: any) => <PendingApprovalRow key={t.id} t={t} showOwner onChanged={reload} />)
          )}
        </div>
      )}
    </div>
  );
}
