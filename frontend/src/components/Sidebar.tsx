import { NavLink } from "react-router-dom";
import type { User } from "../App";

declare const __APP_VERSION__: string;

export default function Sidebar({ user }: { user: User }) {
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
      <NavLink className="nav-item" to="/manage">
        Admin & Owners
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
      <NavLink className="nav-item" to="/notifications">
        Escalations
      </NavLink>
      <NavLink className="nav-item" to="/feedback">
        Feedback
      </NavLink>
      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
        Built for MCS Leadership<br />by team DSDP
      </div>
    </aside>
  );
}
