import { useEffect, useState } from "react";
import { api } from "../api";
import { ComboBox } from "../components/ComboBox";

type Team = { id: string; name: string };
type Link = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  visibility: "private" | "shared";
  owner_name?: string;
  teams: Team[];
};

const emptyForm = { url: "", title: "", description: "", team_ids: [] as string[] };

export default function LinksPage() {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [myLinks, setMyLinks] = useState<Link[]>([]);
  const [sharedLinks, setSharedLinks] = useState<Link[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMine() {
    try {
      setMyLinks(await api("/links?scope=mine"));
    } catch (err: any) { setError(err.message); }
  }

  async function loadShared() {
    try {
      setSharedLinks(await api("/links?scope=shared"));
    } catch (err: any) { setError(err.message); }
  }

  useEffect(() => {
    api("/share-teams").then(setTeams).catch(() => {});
    loadMine();
    loadShared();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(link: Link) {
    setEditingId(link.id);
    setForm({
      url: link.url,
      title: link.title,
      description: link.description || "",
      team_ids: link.teams.map((t) => t.id)
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!form.url || !form.title) {
      setError("URL and title are required");
      return;
    }
    try {
      if (editingId) {
        await api(`/links/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ url: form.url, title: form.title, description: form.description })
        });
        // Diff team selection against what's currently shared and issue minimal add/remove calls.
        const existing = await api(`/links/${editingId}/teams`) as { team_id: string }[];
        const existingIds = existing.map((t) => t.team_id);
        const toAdd = form.team_ids.filter((id) => !existingIds.includes(id));
        const toRemove = existingIds.filter((id) => !form.team_ids.includes(id));
        if (toAdd.length > 0) {
          await api(`/links/${editingId}/teams`, { method: "POST", body: JSON.stringify({ team_ids: toAdd }) });
        }
        for (const teamId of toRemove) {
          await api(`/links/${editingId}/teams/${teamId}`, { method: "DELETE" });
        }
      } else {
        await api("/links", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await loadMine();
    } catch (err: any) { setError(err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this link?")) return;
    try {
      await api(`/links/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      await loadMine();
    } catch (err: any) { setError(err.message); }
  }

  const teamOptions = teams.map((t) => ({ id: t.id, label: t.name }));

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Links</h1>
      <p style={{ color: "var(--muted)", marginBottom: 20, fontSize: 14 }}>
        Save and share useful links with your teams.
      </p>

      <div className="inline-actions" style={{ marginBottom: 16 }}>
        <button className={`button ${tab === "mine" ? "" : "secondary"}`} onClick={() => setTab("mine")}>My Links</button>
        <button className={`button ${tab === "shared" ? "" : "secondary"}`} onClick={() => setTab("shared")}>Shared with me</button>
      </div>

      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      {tab === "mine" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>{editingId ? "Edit Link" : "Add Link"}</h3>
            <div className="form-row">
              <input className="input" placeholder="https://example.com" value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <input className="input" placeholder="Title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <textarea className="input" placeholder="Description (optional)" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ marginTop: 8, minHeight: 60, width: "100%", boxSizing: "border-box" }} />
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Share with team(s) — leave empty to keep private</div>
              <ComboBox
                options={teamOptions}
                selectedIds={form.team_ids}
                onChange={(ids) => setForm({ ...form, team_ids: ids })}
                placeholder="Select team(s)…"
                multi
              />
            </div>
            <div className="inline-actions">
              <button className="button" onClick={handleSubmit}>{editingId ? "Save Changes" : "Add Link"}</button>
              {editingId && <button className="button secondary" onClick={resetForm}>Cancel</button>}
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>My Links ({myLinks.length})</h3>
            {myLinks.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No links yet</div>
            ) : (
              myLinks.map((l) => (
                <div key={l.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <a href={l.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500, fontSize: 14 }}>{l.title}</a>
                      <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>{l.url}</div>
                      {l.description && <div style={{ fontSize: 13, marginTop: 4 }}>{l.description}</div>}
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {l.teams.length === 0 ? (
                          <span className="badge">Private</span>
                        ) : (
                          l.teams.map((t) => <span key={t.id} className="badge">{t.name}</span>)
                        )}
                      </div>
                    </div>
                    <div className="inline-actions" style={{ flexShrink: 0 }}>
                      <button className="button secondary" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => startEdit(l)}>Edit</button>
                      <button className="button danger" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => handleDelete(l.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === "shared" && (
        <div className="card">
          <h3 style={{ margin: "0 0 12px 0" }}>Shared with me ({sharedLinks.length})</h3>
          {sharedLinks.length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>No links have been shared with your teams yet</div>
          ) : (
            sharedLinks.map((l) => (
              <div key={l.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ fontWeight: 500, fontSize: 14 }}>{l.title}</a>
                <div style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>{l.url}</div>
                {l.description && <div style={{ fontSize: 13, marginTop: 4 }}>{l.description}</div>}
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                  Shared by {l.owner_name} · {l.teams.map((t) => t.name).join(", ")}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
