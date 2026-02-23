import { NavLink } from "react-router-dom";
import type { User } from "../App";

export default function Sidebar({ user }: { user: User }) {
  return (
    <aside className="sidebar">
      <div className="brand">PRISM</div>
      <div style={{ marginBottom: 16, color: "#9aa5b1" }}>
        {user.name}
        <div style={{ fontSize: 12 }}>{user.role}</div>
      </div>
      <NavLink className="nav-item" to="/">
        Dashboards
      </NavLink>
      <NavLink className="nav-item" to="/personal">
        My Work
      </NavLink>
      <NavLink className="nav-item" to="/team">
        Team View
      </NavLink>
      <NavLink className="nav-item" to="/search">
        Search
      </NavLink>
      <NavLink className="nav-item" to="/notifications">
        Escalations
      </NavLink>
    </aside>
  );
}
