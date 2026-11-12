import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { RequestUpdateButton } from "./RequestUpdateButton";

/**
 * Open items escalated to the signed-in user (latest per item, last 30 days),
 * each with "Request update": emails the people it's waiting on, user in CC.
 * Used on the Personal, Team and Escalations pages. onCount reports how many.
 */
export function EscalatedToYou({ onCount, title = "Escalated to you" }: { onCount?: (n: number) => void; title?: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api("/escalations/mine").then((r: any[]) => { setRows(r); onCount?.(r.length); }).catch(() => { setRows([]); onCount?.(0); });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Open items from the last 30 days</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        <strong>Request update</strong> emails the people an item is waiting on, with you in CC — replies come to you. Once a day per item.
      </div>
      {rows === null ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing is escalated to you right now.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Item</th><th>Dashboard</th><th>Why</th><th>Waiting on</th><th>Status</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><div style={{ fontWeight: 600 }}>{e.label}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{e.entity_type}</div></td>
                  <td><Link to={`/dashboards/${e.dashboard_id}`}>{e.dashboard_name}</Link></td>
                  <td style={{ fontSize: 13 }}>{e.message}</td>
                  <td>{e.pending.map((p: any) => p.name).join(", ") || "—"}</td>
                  <td><span className="tag amber">{e.entity_status}</span></td>
                  <td>{e.due_date ? String(e.due_date).slice(0, 10) : "—"}</td>
                  <td><RequestUpdateButton escalation={e} onDone={load} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
