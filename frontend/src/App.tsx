import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import LoginPage from "./pages/LoginPage";
import DashboardsPage from "./pages/DashboardsPage";
import DashboardDetailPage from "./pages/DashboardDetailPage";
import PersonalPage from "./pages/PersonalPage";
import TeamPage from "./pages/TeamPage";
import SearchPage from "./pages/SearchPage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminPage from "./pages/AdminPage";
import EscalationRulesPage from "./pages/EscalationRulesPage";
import AuditLogPage from "./pages/AuditLogPage";
import SnapshotsPage from "./pages/SnapshotsPage";
import FeedbackPage from "./pages/FeedbackPage";
import AccessLogPage from "./pages/AccessLogPage";
import Sidebar from "./components/Sidebar";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "User";
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSessions, setActiveSessions] = useState<{ id: string; name: string; email: string }[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const location = useLocation();

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [location.pathname]);

  const isAdmin = user?.role === "Admin" || user?.role === "SuperAdmin";

  useEffect(() => {
    if (!isAdmin) return;
    api("/admin/active-sessions").then(setActiveSessions).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!showSessions) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-sessions-widget]")) setShowSessions(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showSessions]);

  if (loading) {
    return <div className="main">Loading...</div>;
  }

  if (!user) {
    return <LoginPage onAuthed={(data) => setUser(data)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <div>
        <div className="header">
          <div>
            <div className="header-title">PRISM</div>
            <div className="header-subtitle">Performance Reporting, Insights & Status Management</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isAdmin && (
              <div style={{ position: "relative" }} data-sessions-widget="">
                <button
                  className="button secondary"
                  style={{ height: 32, padding: "0 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => {
                    setShowSessions((v) => !v);
                    api("/admin/active-sessions").then(setActiveSessions).catch(() => {});
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
                  {activeSessions.length} online
                </button>
                {showSessions && (
                  <div style={{
                    position: "absolute", right: 0, top: 38, zIndex: 50,
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                    minWidth: 230, padding: "8px 0"
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--muted)", padding: "4px 14px 8px" }}>
                      Currently Online
                    </div>
                    {activeSessions.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--muted)", padding: "4px 14px" }}>No active sessions</div>
                    ) : (
                      activeSessions.map((s) => (
                        <div key={s.id} style={{ fontSize: 13, padding: "6px 14px", borderTop: "1px solid var(--border)" }}>
                          <div style={{ fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.email}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            <span style={{ fontSize: 13, color: "#6b7280" }}>{user.name}</span>
            <button
              className="button secondary"
              style={{ height: 32, padding: "0 14px", fontSize: 13 }}
              onClick={() => api("/auth/logout", { method: "POST" }).finally(() => setUser(null))}
            >
              Log out
            </button>
          </div>
        </div>
        <main className="main">
          <Routes>
            <Route path="/" element={<DashboardsPage />} />
            <Route path="/dashboards/:id" element={<DashboardDetailPage />} />
            <Route path="/personal" element={<PersonalPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/manage" element={<AdminPage />} />
            <Route path="/snapshots" element={<SnapshotsPage />} />
            <Route path="/escalations" element={<EscalationRulesPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/feedback" element={<FeedbackPage user={user} />} />
            <Route path="/access-logs" element={<AccessLogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
