import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
import type { User } from "../App";

declare const __APP_VERSION__: string;

export default function Sidebar({ user }: { user: User }) {
  const [pendingSignups, setPendingSignups] = useState(0);
  const isAdmin = user.role === "Admin" || user.role === "SuperAdmin";

  useEffect(() => {
    if (!isAdmin) return;
    api("/admin/signup-requests/pending-count")
      .then((d: any) => setPendingSignups(d.count))
      .catch(() => {});
  }, [isAdmin]);

  return (
    <aside className="sidebar" style={{ display: "flex", flexDirection: "column" }}>
      <div>
        <div className="brand">PRISM</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: -14, marginBottom: 20 }}>
          v{__APP_VERSION__}
        </div>
      </div>
      <div style={{ marginBottom: 16, color: "rgba(255,255,255,0.55)" }}>
        {user.name}
        <div style={{ fontSize: 12 }}>{user.role}</div>
      </div>
      <NavLink className="nav-item" to="/">
        Dashboards
      </NavLink>
      <NavLink className="nav-item" to="/personal">
        Personal View
      </NavLink>
      <NavLink className="nav-item" to="/team">
        Team View
      </NavLink>
      <NavLink className="nav-item" to="/search">
        Search
      </NavLink>
      <NavLink className="nav-item" to="/manage" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Admin & Owners
        {pendingSignups > 0 && (
          <span style={{ background: "#e53935", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 700, lineHeight: 1.6 }}>
            {pendingSignups}
          </span>
        )}
      </NavLink>
      <NavLink className="nav-item" to="/snapshots">
        Publishing
      </NavLink>
      <NavLink className="nav-item" to="/escalations">
        Escalation Rules
      </NavLink>
      <NavLink className="nav-item" to="/audit">
        Audit Log
      </NavLink>
      {isAdmin && (
        <NavLink className="nav-item" to="/access-logs">
          Access Logs
        </NavLink>
      )}
      <NavLink className="nav-item" to="/notifications">
        Escalations
      </NavLink>
      <NavLink className="nav-item" to="/feedback">
        Feedback
      </NavLink>
      <NavLink className="nav-item" to="/profile">
        My Profile
      </NavLink>
      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
        Built for MCS Leadership<br />by team DSDP
      </div>
    </aside>
  );
}
