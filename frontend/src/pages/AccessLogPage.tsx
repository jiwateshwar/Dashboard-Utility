import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function AccessLogPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [filters, setFilters] = useState({ user_id: "", from_date: "", to_date: "" });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"activity" | "visitors" | "logins">("activity");

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

      <div className="tab-bar">
        <button className={`tab${view === "activity" ? " active" : ""}`} onClick={() => setView("activity")}>Last activity</button>
        <button className={`tab${view === "visitors" ? " active" : ""}`} onClick={() => setView("visitors")}>Dashboard visitors</button>
        <button className={`tab${view === "logins" ? " active" : ""}`} onClick={() => setView("logins")}>Login history</button>
      </div>

      {view === "activity" && <LastActivity />}
      {view === "visitors" && <DashboardVisitors />}

      {view === "logins" && <>
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
      </>}
    </div>
  );
}

function ago(ts?: string | null) {
  if (!ts) return "Never";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function fmtFull(ts?: string | null) {
  return ts ? new Date(ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** When each user last actually used the app (scroll/click/typing), not just signed in. */
function LastActivity() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [hideInactive, setHideInactive] = useState(true);
  useEffect(() => { api("/admin/user-activity").then(setRows).catch(() => setRows([])); }, []);
  const shown = (rows ?? []).filter((r) =>
    (!hideInactive || r.is_active) && (!q || `${r.name} ${r.email}`.toLowerCase().includes(q.toLowerCase())));
  const activeToday = (rows ?? []).filter((r) => r.last_active_at && Date.now() - new Date(r.last_active_at).getTime() < 86400000).length;
  const active7 = (rows ?? []).filter((r) => r.last_active_at && Date.now() - new Date(r.last_active_at).getTime() < 7 * 86400000).length;

  return (
    <div className="card">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>{activeToday}</strong> active in the last 24 h · <strong style={{ color: "var(--text)" }}>{active7}</strong> in the last 7 days
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <label style={{ fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} style={{ marginRight: 6 }} />
            Hide deactivated users
          </label>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>User</th><th>Email</th><th>Last activity</th><th>Last sign-in</th><th>Dashboards viewed (7 days)</th></tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>No users match</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.name}{!r.is_active && <span className="tag grey" style={{ marginLeft: 6 }}>Deactivated</span>}</td>
                <td style={{ color: "var(--muted)" }}>{r.email}</td>
                <td title={fmtFull(r.last_active_at)}>{ago(r.last_active_at)}</td>
                <td title={fmtFull(r.last_login_at)}>{ago(r.last_login_at)}</td>
                <td>{r.dashboards_viewed_7d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
        "Last activity" is the last time the person scrolled, clicked or typed on a PRISM page. Tracking started when this feature went live, so it shows "Never" for anyone who hasn't used PRISM since.
      </div>
    </div>
  );
}

/** Unique visitors per dashboard, this week so far vs last week. */
function DashboardVisitors() {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    api("/analytics/overview").then(setData).catch(() => setData({ dashboards: [] }));
    api("/auth/me").then(setMe).catch(() => {});
  }, []);
  const label = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

  return (
    <div className="card">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 640 }}>
          A visitor is counted once per dashboard per week, however often they open it. Weeks run Monday to Sunday.
          Each Monday, everyone subscribed to a dashboard (its owners and people given access) gets last week's numbers by email.
        </div>
        {me?.role === "SuperAdmin" && (
          <button className="button secondary" onClick={() => api("/analytics/preview-report", { method: "POST" }).then((r: any) => setMsg(r.message)).catch((e: any) => setMsg(e.message))}>
            Email me last week's report
          </button>
        )}
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 10 }}>{msg}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Dashboard</th>
              <th>This week{data ? ` (from ${label(data.this_week_start)})` : ""}</th>
              <th>Last week{data ? ` (${label(data.last_week_start)})` : ""}</th>
              <th>Views last week</th>
              <th>Subscribers</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr><td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>Loading…</td></tr>
            ) : data.dashboards.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: "24px 0" }}>No dashboards</td></tr>
            ) : data.dashboards.map((d: any) => (
              <tr key={d.dashboard_id}>
                <td style={{ fontWeight: 500 }}><Link to={`/dashboards/${d.dashboard_id}`}>{d.name}</Link></td>
                <td>{d.this_week_unique}</td>
                <td>{d.last_week_unique}</td>
                <td>{d.last_week_views}</td>
                <td>{d.subscribers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
