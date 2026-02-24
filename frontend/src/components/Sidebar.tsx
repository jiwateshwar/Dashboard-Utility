import { NavLink } from "react-router-dom";
import type { User } from "../App";

export default function Sidebar({ user }: { user: User }) {
  return (
    <aside className="sidebar">
      <div className="brand">PRISM</div>
      <div style={{ marginBottom: 16, color: "#6b7280" }}>
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
    </aside>
  );
}
