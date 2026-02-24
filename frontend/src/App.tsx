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
  const location = useLocation();

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [location.pathname]);

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
