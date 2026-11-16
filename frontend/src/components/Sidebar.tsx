import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";
import type { User } from "../App";

declare const __APP_VERSION__: string;

/**
 * "auto"   — collapsed to an icon rail so pages get the width; hovering (or
 *            keyboard focus) slides the full menu out over the page, and it
 *            tucks away again on leave or after picking a link.
 * "pinned" — always open, pushing the page over (the old behaviour).
 * On narrow screens the sidebar is hidden and opened from the header's ☰.
 */
export type SidebarMode = "auto" | "pinned";

// Simple stroke icons (24×24), so the collapsed rail stays usable.
const ICONS: Record<string, ReactNode> = {
  dashboards: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  personal: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.5 3.5 0 0 1 0 7.6" /><path d="M21.5 21a6.5 6.5 0 0 0-4.5-6.2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.6-4.6" /></>,
  links: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  admin: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  publishing: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  escalations: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>,
  access: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  backups: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" /></>,
  sso: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 21 2M16 7l3 3M19 4l2 2" /></>,
  email: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></>,
  notifications: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  feedback: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  profile: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M7 20.7a6 6 0 0 1 10 0" /></>,
  collapse: <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />,
  expand: <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
};
const Icon = ({ name }: { name: string }) => (
  <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);

export default function Sidebar({ user, mode, onModeChange, mobileOpen, onMobileClose }: {
  user: User;
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const [pendingSignups, setPendingSignups] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const isAdmin = user.role === "Admin" || user.role === "SuperAdmin";
  const isSuperAdmin = user.role === "SuperAdmin";

  useEffect(() => {
    if (!isAdmin) return;
    api("/admin/signup-requests/pending-count")
      .then((d: any) => setPendingSignups(d.count))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    api("/notifications/unread-count")
      .then((d: any) => setUnreadNotifications(d.count))
      .catch(() => {});
  }, []);

  // Expanded = pinned, hovered/focused while auto-hiding, or opened on a phone.
  const expanded = mode === "pinned" || hovered || mobileOpen;

  const open = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  // Small delay so moving the pointer across the edge doesn't flicker it shut.
  const close = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHovered(false), 220);
  };
  const afterNavigate = () => {
    if (mode === "auto") setHovered(false);
    onMobileClose();
  };

  const { pathname } = useLocation();
  const item = (to: string, icon: string, label: string, badge = 0) => (
    <NavLink
      // "Dashboards" covers the list and every /dashboards/:id page.
      className={({ isActive }) => `nav-item${isActive || (to === "/" && pathname.startsWith("/dashboards")) ? " active" : ""}`}
      to={to} end={to === "/"} onClick={afterNavigate} title={expanded ? undefined : label}>
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </NavLink>
  );

  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <div className={`sidebar-slot ${mode}`}>
        <aside
          className={`sidebar ${mode} ${expanded ? "expanded" : "collapsed"}${mobileOpen ? " open" : ""}`}
          onMouseEnter={mode === "auto" ? open : undefined}
          onMouseLeave={mode === "auto" ? close : undefined}
          onFocus={mode === "auto" ? open : undefined}
          onBlur={mode === "auto" ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); } : undefined}
        >
          <div className="sidebar-top">
            <div className="brand-block">
              <div className="brand">{expanded ? "PRISM" : "P"}</div>
              <div className="sidebar-version">v{__APP_VERSION__}</div>
            </div>
            <button
              type="button"
              className="sidebar-pin"
              onClick={() => { onModeChange(mode === "pinned" ? "auto" : "pinned"); setHovered(false); }}
              title={mode === "pinned" ? "Auto-hide the sidebar" : "Keep the sidebar open"}
              aria-label={mode === "pinned" ? "Auto-hide the sidebar" : "Keep the sidebar open"}
            >
              <Icon name={mode === "pinned" ? "collapse" : "expand"} />
            </button>
          </div>

          <div className="sidebar-user" title={expanded ? undefined : `${user.name} · ${user.role}`}>
            <span className="sidebar-avatar">{initials}</span>
            <span className="nav-label">
              {user.name}
              <span style={{ display: "block", fontSize: 12 }}>{user.role}</span>
            </span>
          </div>

          <nav className="sidebar-nav">
            {item("/", "dashboards", "Dashboards")}
            {item("/personal", "personal", "Personal View")}
            {item("/team", "team", "Team View")}
            {item("/search", "search", "Search")}
            {item("/links", "links", "Links")}
            {item("/manage", "admin", "Admin & Owners", pendingSignups)}
            {item("/snapshots", "publishing", "Publishing")}
            {item("/escalations", "escalations", "Escalations")}
            {item("/audit", "audit", "Audit Log")}
            {isAdmin && item("/access-logs", "access", "Access Logs")}
            {isSuperAdmin && item("/system-backups", "backups", "System Backups")}
            {isSuperAdmin && item("/sso-settings", "sso", "SSO Settings")}
            {isSuperAdmin && item("/email-settings", "email", "Email Settings")}
            {item("/notifications", "notifications", "Notifications", unreadNotifications)}
            {item("/feedback", "feedback", "Feedback")}
            {item("/profile", "profile", "My Profile")}
          </nav>

          <div className="sidebar-footer nav-label">
            Built for MCS Leadership<br />by team DSDP
          </div>
        </aside>
      </div>
    </>
  );
}
