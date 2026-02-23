import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<any[]>([]);

  useEffect(() => {
    api("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }, []);

  return (
    <div>
      <h1>Dashboards</h1>
      <div className="grid two">
        {dashboards.map((d) => (
          <Link to={`/dashboards/${d.id}`} key={d.id} className="card">
            <h3 style={{ marginTop: 0 }}>{d.name}</h3>
            <p style={{ color: "#9aa5b1" }}>{d.description || "No description"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
