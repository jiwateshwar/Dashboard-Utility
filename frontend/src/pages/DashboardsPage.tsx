import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api("/dashboards");
      setDashboards(data);
    } catch {
      setDashboards([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function requestAccess(dashboardId: string) {
    setRequesting(dashboardId);
    setError(null);
    try {
      await api(`/dashboards/${dashboardId}/request-access`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to send request");
    } finally {
      setRequesting(null);
    }
  }

  // Group dashboards by group_name; null/undefined group goes to "Ungrouped"
  const grouped: Record<string, any[]> = {};
  const ungrouped: any[] = [];

  for (const d of dashboards) {
    if (d.group_name) {
      if (!grouped[d.group_name]) grouped[d.group_name] = [];
      grouped[d.group_name].push(d);
    } else {
      ungrouped.push(d);
    }
  }

  const groupNames = Object.keys(grouped).sort();

  function DashboardCard({ d }: { d: any }) {
    const owners: any[] = d.owners ?? [];
    const ownerText = owners.map((o: any) => o.name).join(", ") || "—";

    if (d.has_access) {
      return (
        <Link
          to={`/dashboards/${d.id}`}
          className="card"
          style={{ textDecoration: "none", borderLeft: "3px solid #2ebd85", display: "block" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15 }}>{d.name}</h3>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(46,189,133,0.12)", color: "#2ebd85", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
              Access
            </span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 4 }}>{d.description || "No description"}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Owners: {ownerText}</div>
        </Link>
      );
    }

    return (
      <div
        className="card"
        style={{ opacity: 0.6, borderLeft: "3px solid var(--border)", cursor: "default" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 15, color: "var(--muted)" }}>{d.name}</h3>
          {d.has_pending_request ? (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(245,166,35,0.12)", color: "#f5a623", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
              Requested
            </span>
          ) : (
            <button
              className="button secondary"
              style={{ height: 26, padding: "0 10px", fontSize: 11, flexShrink: 0 }}
              disabled={requesting === d.id}
              onClick={() => requestAccess(d.id)}
            >
              {requesting === d.id ? "Sending…" : "Request Access"}
            </button>
          )}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 4 }}>{d.description || "No description"}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Owners: {ownerText}</div>
      </div>
    );
  }

  function GroupSection({ name, items }: { name: string; items: any[] }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
          {name}
          <span style={{ marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            ({items.filter((d) => d.has_access).length}/{items.length} accessible)
          </span>
        </div>
        <div className="grid two">
          {items.map((d) => <DashboardCard key={d.id} d={d} />)}
        </div>
      </div>
    );
  }

  const total = dashboards.length;
  const accessible = dashboards.filter((d) => d.has_access).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Dashboards</h1>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{accessible} of {total} accessible</span>
      </div>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {dashboards.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No dashboards found</div>
      ) : (
        <>
          {groupNames.map((name) => (
            <GroupSection key={name} name={name} items={grouped[name]} />
          ))}
          {ungrouped.length > 0 && (
            <GroupSection name="Ungrouped" items={ungrouped} />
          )}
        </>
      )}
    </div>
  );
}
