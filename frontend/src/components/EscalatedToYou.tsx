import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { RequestUpdateButton } from "./RequestUpdateButton";
import { useRememberedState } from "../lib/navMemory";

type SortKey = "dashboard" | "waiting" | "status" | "due";
type DueFilter = "" | "overdue" | "week" | "later" | "none";

// Statuses whose due date is never chased (closed, awaiting approval, or on hold).
const NOT_OVERDUE = ["Closed Accepted", "Closed Pending Approval", "Dropped", "Parked", "Closed", "Mitigated", "Approved", "Rejected"];

const due10 = (e: any): string => (e.due_date ? String(e.due_date).slice(0, 10) : "");
const waitingText = (e: any): string => (e.pending ?? []).map((p: any) => p.name).join(", ");

function localToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sortValue(e: any, key: SortKey): string {
  if (key === "dashboard") return e.dashboard_name ?? "";
  if (key === "waiting") return waitingText(e);
  if (key === "status") return e.entity_status ?? "";
  return due10(e);
}

/**
 * Open items escalated to the signed-in user (latest per item, last 30 days),
 * each with "Request update": emails the people it's waiting on, user in CC.
 * Filter and sort by dashboard, waiting on, status and due date.
 * Used on the Personal, Team and Escalations pages. onCount reports how many.
 */
export function EscalatedToYou({ onCount, title = "Escalated to you" }: { onCount?: (n: number) => void; title?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api("/escalations/mine").then((r: any[]) => { setRows(r); onCount?.(r.length); }).catch(() => { setRows([]); onCount?.(0); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const [fDashboard, setFDashboard] = useRememberedState("esc.dashboard", "");
  const [fWaiting, setFWaiting] = useRememberedState("esc.waiting", "");
  const [fStatus, setFStatus] = useRememberedState("esc.status", "");
  const [fDue, setFDue] = useRememberedState<DueFilter>("esc.due", "");
  const [sortKey, setSortKey] = useRememberedState<SortKey>("esc.sortKey", "due");
  const [sortAsc, setSortAsc] = useRememberedState("esc.sortAsc", true);

  const options = useMemo(() => {
    const all = rows ?? [];
    const dashboards = new Map<string, string>();
    const people = new Map<string, string>();
    const statuses = new Set<string>();
    for (const e of all) {
      if (e.dashboard_id) dashboards.set(e.dashboard_id, e.dashboard_name ?? "—");
      for (const p of e.pending ?? []) people.set(p.id, p.name);
      if (e.entity_status) statuses.add(e.entity_status);
    }
    const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1]);
    return {
      dashboards: [...dashboards].sort(byLabel),
      people: [...people].sort(byLabel),
      statuses: [...statuses].sort()
    };
  }, [rows]);

  const shown = useMemo(() => {
    const today = localToday();
    const in7 = localToday(7);
    const filtered = (rows ?? []).filter((e) => {
      if (fDashboard && e.dashboard_id !== fDashboard) return false;
      if (fWaiting && !(e.pending ?? []).some((p: any) => p.id === fWaiting)) return false;
      if (fStatus && e.entity_status !== fStatus) return false;
      if (fDue) {
        const d = due10(e);
        if (fDue === "none") return !d;
        if (!d) return false;
        if (fDue === "overdue") return d < today && !NOT_OVERDUE.includes(e.entity_status);
        if (fDue === "week") return d >= today && d <= in7;
        if (fDue === "later") return d > in7;
      }
      return true;
    });
    // Empty values (no due date, nobody waiting) always sort last, whichever direction.
    return filtered.sort((a, b) => {
      const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (!va && !vb) return 0;
      if (!va) return 1;
      if (!vb) return -1;
      const c = va.localeCompare(vb, undefined, { sensitivity: "base" });
      return sortAsc ? c : -c;
    });
  }, [rows, fDashboard, fWaiting, fStatus, fDue, sortKey, sortAsc]);

  const anyFilter = !!(fDashboard || fWaiting || fStatus || fDue);
  const clearFilters = () => { setFDashboard(""); setFWaiting(""); setFStatus(""); setFDue(""); };

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }
  function SortTh({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th onClick={() => toggleSort(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} title={`Sort by ${label}`}>
        {label}<span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>{active ? (sortAsc ? "▲" : "▼") : "↕"}</span>
      </th>
    );
  }

  const selectStyle = { height: 32, fontSize: 13, minWidth: 0, flex: "1 1 150px" } as const;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Open items from the last 30 days</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        <strong>Request update</strong> emails the people an item is waiting on, with you in CC — replies come to you. Still no answer? Send it again: it goes out as a second reminder, then a third, and so on.
      </div>
      {rows === null ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing is escalated to you right now.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select className="select" style={selectStyle} value={fDashboard} onChange={(e) => setFDashboard(e.target.value)} aria-label="Filter by dashboard">
              <option value="">All dashboards</option>
              {options.dashboards.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="select" style={selectStyle} value={fWaiting} onChange={(e) => setFWaiting(e.target.value)} aria-label="Filter by waiting on">
              <option value="">Waiting on anyone</option>
              {options.people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select className="select" style={selectStyle} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
              <option value="">Any status</option>
              {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" style={selectStyle} value={fDue} onChange={(e) => setFDue(e.target.value as DueFilter)} aria-label="Filter by due date">
              <option value="">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="week">Due in next 7 days</option>
              <option value="later">Due later</option>
              <option value="none">No due date</option>
            </select>
            {anyFilter && <button className="button secondary" style={{ height: 32, padding: "0 10px", fontSize: 12 }} onClick={clearFilters}>Clear</button>}
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>{shown.length} of {rows.length}</span>
          </div>
          {shown.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No escalations match these filters.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Item</th><SortTh k="dashboard" label="Dashboard" /><th>Why</th><SortTh k="waiting" label="Waiting on" /><SortTh k="status" label="Status" /><SortTh k="due" label="Due" /><th></th></tr></thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.id}>
                      <td><div style={{ fontWeight: 600 }}>{e.entity_type === "Task" ? <Link to={`/tasks/${e.entity_id}`} className="task-link">{e.label}</Link> : e.label}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{e.entity_type}</div></td>
                      <td><Link to={`/dashboards/${e.dashboard_id}`}>{e.dashboard_name}</Link></td>
                      <td style={{ fontSize: 13 }}>{e.message}</td>
                      <td>{waitingText(e) || "—"}</td>
                      <td><span className={`tag ${e.entity_status === "Parked" ? "grey" : "amber"}`}>{e.entity_status}</span></td>
                      <td>{due10(e) || "—"}</td>
                      <td><RequestUpdateButton escalation={e} onDone={load} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
