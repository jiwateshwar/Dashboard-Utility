import { useEffect, useState } from "react";
import { api } from "../api";

export default function AccessLogPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [filters, setFilters] = useState({ user_id: "", from_date: "", to_date: "" });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/users").then(setUsers).catch(() => {});
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.user_id)   p.set("user_id",   filters.user_id);
      if (filters.from_date) p.set("from_date",  filters.from_date);
      if (filters.to_date)   p.set("to_date",    filters.to_date);
      const data = await api(`/admin/login-history?${p.toString()}`);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  function fmt(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function browser(ua?: string) {
    if (!ua) return "—";
    if (ua.includes("Edg"))     return "Edge";
    if (ua.includes("Chrome"))  return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari"))  return "Safari";
    return ua.slice(0, 40);
  }

  return (
    <div>
      <h1>Access Logs</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-row">
          <select
            className="select"
            value={filters.user_id}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            placeholder="From date"
            value={filters.from_date}
            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
          />
          <input
            className="input"
            type="date"
            placeholder="To date"
            value={filters.to_date}
            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="button" onClick={load}>Filter</button>
          <button
            className="button secondary"
            onClick={() => {
              setFilters({ user_id: "", from_date: "", to_date: "" });
              // trigger reload with empty filters on next render
              setTimeout(load, 0);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ color: "var(--muted)", padding: "24px 0", textAlign: "center" }}>Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Login Time</th>
                <th>IP Address</th>
                <th>Browser</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>
                    No login records found
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500 }}>{i.name}</td>
                    <td style={{ color: "var(--muted)" }}>{i.email}</td>
                    <td>{fmt(i.logged_in_at)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{i.ip_address || "—"}</td>
                    <td>{browser(i.user_agent)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        {items.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Showing {items.length} most recent login{items.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
