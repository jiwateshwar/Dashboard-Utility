import { useEffect, useState } from "react";
import { api } from "../api";

export default function AuditLogPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    dashboard_id: "",
    entity_type: "",
    entity_id: ""
  });
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }, []);

  async function runSearch() {
    const params = new URLSearchParams();
    if (filters.dashboard_id) params.set("dashboard_id", filters.dashboard_id);
    if (filters.entity_type) params.set("entity_type", filters.entity_type);
    if (filters.entity_id) params.set("entity_id", filters.entity_id);
    const data = await api(`/audit?${params.toString()}`);
    setItems(data);
  }

  useEffect(() => {
    runSearch();
  }, []);

  return (
    <div>
      <h1>Audit Log</h1>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-row">
          <select className="select" value={filters.dashboard_id} onChange={(e) => setFilters({ ...filters, dashboard_id: e.target.value })}>
            <option value="">All Dashboards</option>
            {dashboards.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select className="select" value={filters.entity_type} onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}>
            <option value="">Any Entity</option>
            <option value="Task">Task</option>
            <option value="Risk">Risk</option>
            <option value="Decision">Decision</option>
          </select>
          <input className="input" placeholder="Entity ID" value={filters.entity_id} onChange={(e) => setFilters({ ...filters, entity_id: e.target.value })} />
        </div>
        <button className="button" onClick={runSearch}>Filter</button>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Entity</th><th>Changed By</th><th>Old</th><th>New</th><th>Time</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.entity_type} / {i.entity_id}</td>
                <td>{i.changed_by}</td>
                <td><pre style={{ whiteSpace: "pre-wrap", color: "#9aa5b1" }}>{JSON.stringify(i.old_value, null, 2)}</pre></td>
                <td><pre style={{ whiteSpace: "pre-wrap", color: "#9aa5b1" }}>{JSON.stringify(i.new_value, null, 2)}</pre></td>
                <td>{i.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
