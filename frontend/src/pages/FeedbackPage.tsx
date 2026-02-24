import { useEffect, useState } from "react";
import { api } from "../api";
import type { User } from "../App";

const STATUS_CLASS: Record<string, string> = {
  Open: "amber",
  "In Review": "amber",
  Done: "green"
};

const TYPE_CLASS: Record<string, string> = {
  Bug: "red",
  Idea: "green"
};

export default function FeedbackPage({ user }: { user: User }) {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Idea", title: "", description: "" });
  const [filter, setFilter] = useState<"All" | "Bug" | "Idea">("All");

  async function load() {
    api("/feedback").then(setItems).catch(() => setItems([]));
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    setError(null);
    if (!form.title.trim()) { setError("Title is required"); return; }
    try {
      await api("/feedback", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm({ type: "Idea", title: "", description: "" });
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setError(null);
    try {
      await api(`/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const visible = filter === "All" ? items : items.filter((i) => i.type === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Feedback</h1>
        <button className="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Report Issue / Idea"}
        </button>
      </div>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="inline-create-panel" style={{ marginBottom: 20 }}>
          <div className="form-row">
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="Idea">Idea / Improvement</option>
              <option value="Bug">Bug / Issue</option>
            </select>
            <input
              className="input"
              placeholder="Short title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <textarea
            className="input"
            placeholder="Describe the issue or idea (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            style={{ resize: "vertical", marginBottom: 12 }}
          />
          <button className="button" onClick={handleSubmit}>Submit</button>
        </div>
      )}

      <div className="inline-actions" style={{ marginBottom: 16 }}>
        {(["All", "Bug", "Idea"] as const).map((f) => (
          <button
            key={f}
            className={`tab${filter === f ? " active" : ""}`}
            style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "6px 16px" }}
            onClick={() => setFilter(f)}
          >
            {f === "All" ? `All (${items.length})` : f === "Bug" ? `Bugs (${items.filter(i => i.type === "Bug").length})` : `Ideas (${items.filter(i => i.type === "Idea").length})`}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.length === 0 && (
          <div className="card" style={{ color: "var(--muted)", textAlign: "center" }}>Nothing here yet.</div>
        )}
        {visible.map((item) => (
          <div key={item.id} className="card" style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className={`tag ${TYPE_CLASS[item.type]}`}>{item.type}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{item.title}</span>
                </div>
                {item.description && (
                  <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 6 }}>{item.description}</div>
                )}
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {item.author_name} · {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span className={`tag ${STATUS_CLASS[item.status] ?? "amber"}`}>{item.status}</span>
                {user.role === "Admin" && (
                  <select
                    className="select"
                    style={{ width: "auto" }}
                    value={item.status}
                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                  >
                    <option value="Open">Open</option>
                    <option value="In Review">In Review</option>
                    <option value="Done">Done</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
