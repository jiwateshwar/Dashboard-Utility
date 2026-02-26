import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "dashboards" | "groups" | "accounts" | "categories" | "access">("users");
  const [users, setUsers] = useState<any[]>([]);
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accountDashboard, setAccountDashboard] = useState<string>("");
  const [categoryDashboard, setCategoryDashboard] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({ name: "", email: "", manager_id: "", role: "User" });
  const [editingUser, setEditingUser] = useState<{ id: string; name: string; email: string; manager_id: string; role: string; is_active: boolean } | null>(null);
  const [newDashboard, setNewDashboard] = useState({ name: "", description: "", owner_ids: [] as string[], parent_dashboard_id: "" });
  const [editingDashboard, setEditingDashboard] = useState<{ id: string; name: string; description: string; ownerIds: string[]; parent_dashboard_id: string } | null>(null);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [groupAssign, setGroupAssign] = useState({ dashboard_id: "", group_id: "" });
  const [newAccount, setNewAccount] = useState({ account_name: "", account_type: "", region: "" });
  const [newCategory, setNewCategory] = useState({ name: "" });
  const [accessGrant, setAccessGrant] = useState({ dashboard_id: "", target_user_id: "", can_view: true, can_edit: false });
  const [accessList, setAccessList] = useState<any[]>([]);

  async function loadAll() {
    setError(null);
    try {
      const results = await Promise.allSettled([api("/users"), api("/dashboards"), api("/groups"), api("/accounts")]);
      if (results[0].status === "fulfilled") setUsers(results[0].value as any[]);
      if (results[1].status === "fulfilled") setDashboards(results[1].value as any[]);
      if (results[2].status === "fulfilled") setGroups(results[2].value as any[]);
      if (results[3].status === "fulfilled") setAccounts(results[3].value as any[]);
    } catch (err: any) { setError(err.message || "Failed to load data"); }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!categoryDashboard) { setCategories([]); return; }
    api(`/categories?dashboard_id=${categoryDashboard}`).then(setCategories).catch(() => setCategories([]));
  }, [categoryDashboard]);

  useEffect(() => {
    if (!accessGrant.dashboard_id) { setAccessList([]); return; }
    api(`/dashboards/${accessGrant.dashboard_id}/access`).then(setAccessList).catch(() => setAccessList([]));
  }, [accessGrant.dashboard_id]);

  const dashboardOptions = useMemo(() => dashboards, [dashboards]);

  // ── Owner chip helpers ──────────────────────────────────────

  function addOwnerToNew(uid: string) {
    if (!uid || newDashboard.owner_ids.includes(uid)) return;
    setNewDashboard({ ...newDashboard, owner_ids: [...newDashboard.owner_ids, uid] });
  }
  function removeOwnerFromNew(uid: string) {
    setNewDashboard({ ...newDashboard, owner_ids: newDashboard.owner_ids.filter((id) => id !== uid) });
  }
  function addOwnerToEdit(uid: string) {
    if (!editingDashboard || !uid || editingDashboard.ownerIds.includes(uid)) return;
    setEditingDashboard({ ...editingDashboard, ownerIds: [...editingDashboard.ownerIds, uid] });
  }
  function removeOwnerFromEdit(uid: string) {
    if (!editingDashboard) return;
    setEditingDashboard({ ...editingDashboard, ownerIds: editingDashboard.ownerIds.filter((id) => id !== uid) });
  }

  function OwnerChips({ ownerIds, onRemove }: { ownerIds: string[]; onRemove: (uid: string) => void }) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 32, alignItems: "center" }}>
        {ownerIds.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No owners added yet</span>}
        {ownerIds.map((uid) => {
          const u = users.find((x) => x.id === uid);
          return (
            <span key={uid} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eef6ff", color: "#1d63ed", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>
              {u?.name ?? uid}
              <button onClick={() => onRemove(uid)} style={{ background: "none", border: "none", cursor: "pointer", color: "#1d63ed", padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
            </span>
          );
        })}
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────

  async function handleCreateUser() {
    setError(null);
    try {
      await api("/users", { method: "POST", body: JSON.stringify({ name: newUser.name, email: newUser.email, manager_id: newUser.manager_id || null, role: newUser.role }) });
      setNewUser({ name: "", email: "", manager_id: "", role: "User" });
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function handleUpdateUser() {
    if (!editingUser) return;
    setError(null);
    try {
      await api(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingUser.name, manager_id: editingUser.manager_id || null, role: editingUser.role, is_active: editingUser.is_active })
      });
      setEditingUser(null);
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function handleCreateDashboard() {
    setError(null);
    if (newDashboard.owner_ids.length === 0) { setError("At least one owner is required"); return; }
    try {
      await api("/dashboards", { method: "POST", body: JSON.stringify({ name: newDashboard.name, description: newDashboard.description, owner_ids: newDashboard.owner_ids, parent_dashboard_id: newDashboard.parent_dashboard_id || null }) });
      setNewDashboard({ name: "", description: "", owner_ids: [], parent_dashboard_id: "" });
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function handleUpdateDashboard() {
    if (!editingDashboard) return;
    setError(null);
    if (editingDashboard.ownerIds.length === 0) { setError("At least one owner is required"); return; }
    try {
      await api(`/dashboards/${editingDashboard.id}`, { method: "PATCH", body: JSON.stringify({ name: editingDashboard.name, description: editingDashboard.description, parent_dashboard_id: editingDashboard.parent_dashboard_id || null }) });
      await api(`/dashboards/${editingDashboard.id}/owners`, { method: "PUT", body: JSON.stringify({ owner_ids: editingDashboard.ownerIds }) });
      setEditingDashboard(null);
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function handleToggleDashboardActive(dashboard: any) {
    setError(null);
    try {
      await api(`/dashboards/${dashboard.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !dashboard.is_active }) });
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function startEditDashboard(d: any) {
    let ownerIds: string[] = [];
    try {
      const owners = await api(`/dashboards/${d.id}/owners`);
      ownerIds = (owners as any[]).map((o: any) => o.user_id);
    } catch {
      ownerIds = d.primary_owner_id ? [d.primary_owner_id] : [];
    }
    setEditingDashboard({ id: d.id, name: d.name, description: d.description || "", ownerIds, parent_dashboard_id: d.parent_dashboard_id || "" });
  }

  async function handleCreateGroup() {
    setError(null);
    try {
      await api("/groups", { method: "POST", body: JSON.stringify(newGroup) });
      setNewGroup({ name: "", description: "" });
      await loadAll();
    } catch (err: any) { setError(err.message); }
  }

  async function handleAssignGroup() {
    setError(null);
    try {
      await api("/groups/assign", { method: "POST", body: JSON.stringify(groupAssign) });
      setGroupAssign({ dashboard_id: "", group_id: "" });
    } catch (err: any) { setError(err.message); }
  }

  async function handleCreateAccount() {
    setError(null);
    try {
      await api("/accounts", { method: "POST", body: JSON.stringify({ ...newAccount, dashboard_id: accountDashboard || null }) });
      setNewAccount({ account_name: "", account_type: "", region: "" });
      const a = await api("/accounts");
      setAccounts(a);
    } catch (err: any) { setError(err.message); }
  }

  async function handleCreateCategory() {
    setError(null);
    if (!categoryDashboard) { setError("Select a dashboard for the category"); return; }
    try {
      await api("/categories", { method: "POST", body: JSON.stringify({ dashboard_id: categoryDashboard, name: newCategory.name }) });
      setNewCategory({ name: "" });
      const c = await api(`/categories?dashboard_id=${categoryDashboard}`);
      setCategories(c);
    } catch (err: any) { setError(err.message); }
  }

  async function toggleAccount(account: any) {
    await api(`/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ dashboard_id: accountDashboard || null, is_active: !account.is_active }) });
    const a = await api("/accounts");
    setAccounts(a);
  }

  async function toggleCategory(category: any) {
    if (!categoryDashboard) { setError("Select a dashboard to manage categories"); return; }
    await api(`/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ dashboard_id: categoryDashboard, is_active: !category.is_active }) });
    const c = await api(`/categories?dashboard_id=${categoryDashboard}`);
    setCategories(c);
  }

  async function handleGrantAccess() {
    setError(null);
    try {
      await api(`/dashboards/${accessGrant.dashboard_id}/access`, { method: "POST", body: JSON.stringify(accessGrant) });
      setAccessGrant((prev) => ({ ...prev, target_user_id: "", can_view: true, can_edit: false }));
      const updated = await api(`/dashboards/${accessGrant.dashboard_id}/access`);
      setAccessList(updated);
    } catch (err: any) { setError(err.message); }
  }

  return (
    <div>
      <h1>Governance Admin</h1>
      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      <div className="inline-actions" style={{ marginBottom: 16 }}>
        {(["users", "dashboards", "groups", "accounts", "categories", "access"] as const).map((t) => (
          <button key={t} className={`button ${tab === t ? "" : "secondary"}`} onClick={() => setTab(t)} style={{ textTransform: "capitalize" }}>{t}</button>
        ))}
      </div>

      {tab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>Create User</h3>
            <div className="form-row">
              <input className="input" placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <input className="input" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <select className="select" value={newUser.manager_id} onChange={(e) => setNewUser({ ...newUser, manager_id: e.target.value })}>
                <option value="">No Manager</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="User">User</option>
                <option value="Admin">Admin</option>
                <option value="SuperAdmin">SuperAdmin</option>
              </select>
            </div>
            <button className="button" onClick={handleCreateUser}>Create User</button>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>All Users</h3>

            {editingUser && (
              <div className="inline-create-panel" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Editing: {editingUser.email}</div>
                <div className="form-row">
                  <input className="input" placeholder="Name" value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} />
                  <select className="select" value={editingUser.manager_id}
                    onChange={(e) => setEditingUser({ ...editingUser, manager_id: e.target.value })}>
                    <option value="">No Manager</option>
                    {users.filter((u) => u.id !== editingUser.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select className="select" value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}>
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                  </select>
                  <select className="select" value={editingUser.is_active ? "active" : "inactive"}
                    onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.value === "active" })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="inline-actions">
                  <button className="button" onClick={handleUpdateUser}>Save Changes</button>
                  <button className="button secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                </div>
              </div>
            )}

            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Manager</th><th>Role</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={editingUser?.id === u.id ? { background: "#eef6ff" } : {}}>
                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                    <td style={{ color: "var(--muted)" }}>{u.email}</td>
                    <td style={{ color: "var(--muted)" }}>{users.find((m) => m.id === u.manager_id)?.name || "—"}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                        background: u.role === "SuperAdmin" ? "rgba(139,92,246,0.12)" : u.role === "Admin" ? "rgba(29,99,237,0.10)" : "rgba(0,0,0,0.06)",
                        color: u.role === "SuperAdmin" ? "#7c3aed" : u.role === "Admin" ? "#1d63ed" : "var(--muted)" }}>
                        {u.role}
                      </span>
                    </td>
                    <td><span className="badge">{u.is_active !== false ? "Active" : "Inactive"}</span></td>
                    <td>
                      <button className="button secondary" style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                        onClick={() => setEditingUser({ id: u.id, name: u.name, email: u.email, manager_id: u.manager_id || "", role: u.role, is_active: u.is_active !== false })}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)", textAlign: "center" }}>No users</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "dashboards" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>Create Dashboard</h3>
            <div className="form-row">
              <input className="input" placeholder="Name" value={newDashboard.name} onChange={(e) => setNewDashboard({ ...newDashboard, name: e.target.value })} />
              <input className="input" placeholder="Description" value={newDashboard.description} onChange={(e) => setNewDashboard({ ...newDashboard, description: e.target.value })} />
              <select className="select" value={newDashboard.parent_dashboard_id} onChange={(e) => setNewDashboard({ ...newDashboard, parent_dashboard_id: e.target.value })}>
                <option value="">No Parent (Top Level)</option>
                {dashboards.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Owners</div>
              <OwnerChips ownerIds={newDashboard.owner_ids} onRemove={removeOwnerFromNew} />
              <select className="select" style={{ marginTop: 8, maxWidth: 260 }} value="" onChange={(e) => addOwnerToNew(e.target.value)}>
                <option value="">+ Add owner…</option>
                {users.filter((u) => !newDashboard.owner_ids.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <button className="button" onClick={handleCreateDashboard}>Create Dashboard</button>
          </div>

          <div className="card">
            <h3 style={{ margin: "0 0 12px 0" }}>Existing Dashboards</h3>

            {editingDashboard && (
              <div className="inline-create-panel" style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Editing: {editingDashboard.name}</div>
                <div className="form-row">
                  <input className="input" placeholder="Name" value={editingDashboard.name}
                    onChange={(e) => setEditingDashboard({ ...editingDashboard, name: e.target.value })} />
                  <input className="input" placeholder="Description" value={editingDashboard.description}
                    onChange={(e) => setEditingDashboard({ ...editingDashboard, description: e.target.value })} />
                  <select className="select" value={editingDashboard.parent_dashboard_id}
                    onChange={(e) => setEditingDashboard({ ...editingDashboard, parent_dashboard_id: e.target.value })}>
                    <option value="">No Parent (Top Level)</option>
                    {dashboards.filter((d) => d.id !== editingDashboard.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Owners</div>
                  <OwnerChips ownerIds={editingDashboard.ownerIds} onRemove={removeOwnerFromEdit} />
                  <select className="select" style={{ marginTop: 8, maxWidth: 260 }} value="" onChange={(e) => addOwnerToEdit(e.target.value)}>
                    <option value="">+ Add owner…</option>
                    {users.filter((u) => !editingDashboard.ownerIds.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="inline-actions">
                  <button className="button" onClick={handleUpdateDashboard}>Save Changes</button>
                  <button className="button secondary" onClick={() => setEditingDashboard(null)}>Cancel</button>
                </div>
              </div>
            )}

            <table className="table">
              <thead>
                <tr><th>Name</th><th>Parent</th><th>Description</th><th>Owners</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {dashboards.map((d) => {
                  const owners: any[] = d.owners ?? [];
                  return (
                    <tr key={d.id} style={editingDashboard?.id === d.id ? { background: "#eef6ff" } : {}}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td style={{ color: "var(--muted)" }}>{d.parent_dashboard_name || "—"}</td>
                      <td style={{ color: "var(--muted)" }}>{d.description || "—"}</td>
                      <td>{owners.length > 0 ? owners.map((o: any) => o.name).join(", ") : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td><span className="badge">{d.is_active !== false ? "Active" : "Inactive"}</span></td>
                      <td className="inline-actions">
                        <button className="button secondary" onClick={() => startEditDashboard(d)}>Edit</button>
                        <button className="button secondary" onClick={() => handleToggleDashboardActive(d)}>
                          {d.is_active !== false ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {dashboards.length === 0 && (
                  <tr><td colSpan={6} style={{ color: "var(--muted)", textAlign: "center" }}>No dashboards</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "groups" && (
        <div className="grid two">
          <div className="card">
            <h3>Groups (Admin)</h3>
            <div className="form-row">
              <input className="input" placeholder="Group name" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
              <input className="input" placeholder="Description" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
            </div>
            <div className="inline-actions"><button className="button" onClick={handleCreateGroup}>Create Group</button></div>
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Name</th><th>Status</th></tr></thead>
              <tbody>{groups.map((g) => <tr key={g.id}><td>{g.name}</td><td><span className="badge">{g.is_active ? "Active" : "Inactive"}</span></td></tr>)}</tbody>
            </table>
          </div>
          <div className="card">
            <h3>Assign Group to Dashboard</h3>
            <div className="form-row">
              <select className="select" value={groupAssign.dashboard_id} onChange={(e) => setGroupAssign({ ...groupAssign, dashboard_id: e.target.value })}>
                <option value="">Dashboard</option>
                {dashboardOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="select" value={groupAssign.group_id} onChange={(e) => setGroupAssign({ ...groupAssign, group_id: e.target.value })}>
                <option value="">Group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <button className="button" onClick={handleAssignGroup}>Assign</button>
          </div>
        </div>
      )}

      {tab === "accounts" && (
        <div className="card">
          <h3>Accounts (Admin/Owner)</h3>
          <div className="form-row">
            <input className="input" placeholder="Account name" value={newAccount.account_name} onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })} />
            <input className="input" placeholder="Type" value={newAccount.account_type} onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value })} />
            <input className="input" placeholder="Region" value={newAccount.region} onChange={(e) => setNewAccount({ ...newAccount, region: e.target.value })} />
            <select className="select" value={accountDashboard} onChange={(e) => setAccountDashboard(e.target.value)}>
              <option value="">Dashboard (optional)</option>
              {dashboardOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button className="button" onClick={handleCreateAccount}>Create Account</button>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Name</th><th>Type</th><th>Region</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.account_name}</td><td>{a.account_type || "-"}</td><td>{a.region || "-"}</td>
                  <td><span className="badge">{a.is_active ? "Active" : "Inactive"}</span></td>
                  <td><button className="button" onClick={() => toggleAccount(a)}>{a.is_active ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "categories" && (
        <div className="card">
          <h3>Categories (Owner)</h3>
          <div className="form-row">
            <select className="select" value={categoryDashboard} onChange={(e) => setCategoryDashboard(e.target.value)}>
              <option value="">Dashboard</option>
              {dashboardOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input className="input" placeholder="Category name" value={newCategory.name} onChange={(e) => setNewCategory({ name: e.target.value })} />
          </div>
          <button className="button" onClick={handleCreateCategory}>Create Category</button>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Name</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><span className="badge">{c.is_active ? "Active" : "Inactive"}</span></td>
                  <td><button className="button" onClick={() => toggleCategory(c)}>{c.is_active ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "access" && (
        <div className="card">
          <h3>Dashboard Access (Owner)</h3>
          <div className="form-row">
            <select className="select" value={accessGrant.dashboard_id} onChange={(e) => setAccessGrant({ ...accessGrant, dashboard_id: e.target.value })}>
              <option value="">Dashboard</option>
              {dashboardOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className="select" value={accessGrant.target_user_id} onChange={(e) => setAccessGrant({ ...accessGrant, target_user_id: e.target.value })}>
              <option value="">User</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select className="select" value={accessGrant.can_view ? "yes" : "no"} onChange={(e) => setAccessGrant({ ...accessGrant, can_view: e.target.value === "yes" })}>
              <option value="yes">Can View</option><option value="no">No View</option>
            </select>
            <select className="select" value={accessGrant.can_edit ? "yes" : "no"} onChange={(e) => setAccessGrant({ ...accessGrant, can_edit: e.target.value === "yes" })}>
              <option value="no">No Edit</option><option value="yes">Can Edit</option>
            </select>
          </div>
          <button className="button" onClick={handleGrantAccess}>Grant Access</button>
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>User</th><th>Email</th><th>View</th><th>Edit</th></tr></thead>
            <tbody>
              {accessList.map((a) => (
                <tr key={a.user_id}>
                  <td>{a.name}</td><td>{a.email}</td>
                  <td>{a.can_view ? "Yes" : "No"}</td><td>{a.can_edit ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
