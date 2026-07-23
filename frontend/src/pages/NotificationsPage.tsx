import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const TYPE_LABELS: Record<string, string> = {
  task_assigned: "Task Assigned",
  task_status_changed: "Status Change",
  dashboard_assigned: "Dashboard Access",
  task_overdue: "Overdue",
};

const TYPE_CLASS: Record<string, string> = {
  task_assigned: "green",
  task_status_changed: "amber",
  dashboard_assigned: "green",
  task_overdue: "red",
};

function fmt(dateStr?: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString();
}

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api("/notifications").then(setItems);
  }, []);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await api(`/notifications/read/${id}`, { method: "POST" });
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await api("/notifications/read-all", { method: "POST" });
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Notifications</h1>
        {unreadCount > 0 && (
          <button className="button secondary" onClick={markAllRead}>Mark all read ({unreadCount})</button>
        )}
      </div>
      <div className="card">
        {items.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>No notifications</div>
        ) : (
          items.map((n) => {
            const content = (
              <div
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
                  padding: "10px 0", borderTop: "1px solid var(--border)",
                  cursor: n.is_read ? "default" : "pointer",
                  background: n.is_read ? undefined : "var(--hover, rgba(29,99,237,0.05))"
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 14 }}>{n.message}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {fmt(n.created_at)}
                    {n.dashboard_name && <> · {n.dashboard_name}</>}
                  </div>
                </div>
                <span className={`tag ${TYPE_CLASS[n.type] ?? "grey"}`} style={{ flexShrink: 0 }}>
                  {TYPE_LABELS[n.type] ?? "General"}
                </span>
              </div>
            );
            return n.dashboard_id ? (
              <Link key={n.id} to={`/dashboards/${n.dashboard_id}`} style={{ color: "inherit", textDecoration: "none", display: "block" }}>
                {content}
              </Link>
            ) : (
              content
            );
          })
        )}
      </div>
    </div>
  );
}
