import { useEffect, useState } from "react";
import { api } from "../api";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api("/notifications").then(setItems);
  }, []);

  return (
    <div>
      <h1>Escalations</h1>
      <div className="card">
        {items.map((n) => (
          <div key={n.id} style={{ marginBottom: 8 }}>
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
}
