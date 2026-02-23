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
      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardsPage />} />
          <Route path="/dashboards/:id" element={<DashboardDetailPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/manage" element={<AdminPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
