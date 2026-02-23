import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function AdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [dashboards, setDashboards] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accountDashboard, setAccountDashboard] = useState<string>("");
  const [categoryDashboard, setCategoryDashboard] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    manager_id: "",
    level: "",
    role: "User"
  });

  const [newDashboard, setNewDashboard] = useState({
    name: "",
    description: "",
    primary_owner_id: "",
    secondary_owner_id: ""
  });

  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [groupAssign, setGroupAssign] = useState({ dashboard_id: "", group_id: "" });
  const [newAccount, setNewAccount] = useState({ account_name: "", account_type: "", region: "" });
  const [newCategory, setNewCategory] = useState({ name: "" });
  const [accessGrant, setAccessGrant] = useState({ dashboard_id: "", target_user_id: "", can_view: true, can_edit: false });
  const [accessList, setAccessList] = useState<any[]>([]);

  async function loadAll() {
    setError(null);
    try {
      const results = await Promise.allSettled([
        api("/users"),
        api("/dashboards"),
        api("/groups"),
        api("/accounts")
      ]);
      if (results[0].status === "fulfilled") setUsers(results[0].value as any[]);
      if (results[1].status === "fulfilled") setDashboards(results[1].value as any[]);
      if (results[2].status === "fulfilled") setGroups(results[2].value as any[]);
      if (results[3].status === "fulfilled") setAccounts(results[3].value as any[]);
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!categoryDashboard) {
      setCategories([]);
      return;
    }
    api(`/categories?dashboard_id=${categoryDashboard}`)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [categoryDashboard]);

  useEffect(() => {
    if (!accessGrant.dashboard_id) {
      setAccessList([]);
      return;
    }
    api(`/dashboards/${accessGrant.dashboard_id}/access`)
      .then(setAccessList)
      .catch(() => setAccessList([]));
  }, [accessGrant.dashboard_id]);

  const dashboardOptions = useMemo(() => dashboards, [dashboards]);

  async function handleCreateUser() {
    setError(null);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          manager_id: newUser.manager_id || null,
          level: newUser.level ? Number(newUser.level) : undefined,
          role: newUser.role
        })
      });
      setNewUser({ name: "", email: "", manager_id: "", level: "", role: "User" });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateDashboard() {
    setError(null);
    try {
      await api("/dashboards", {
        method: "POST",
        body: JSON.stringify({
          name: newDashboard.name,
          description: newDashboard.description,
          primary_owner_id: newDashboard.primary_owner_id,
          secondary_owner_id: newDashboard.secondary_owner_id || null
        })
      });
      setNewDashboard({ name: "", description: "", primary_owner_id: "", secondary_owner_id: "" });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateGroup() {
    setError(null);
    try {
      await api("/groups", {
        method: "POST",
        body: JSON.stringify(newGroup)
      });
      setNewGroup({ name: "", description: "" });
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleAssignGroup() {
    setError(null);
    try {
      await api("/groups/assign", {
        method: "POST",
        body: JSON.stringify(groupAssign)
      });
      setGroupAssign({ dashboard_id: "", group_id: "" });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateAccount() {
    setError(null);
    try {
      await api("/accounts", {
        method: "POST",
        body: JSON.stringify({
          ...newAccount,
          dashboard_id: accountDashboard || null
        })
      });
      setNewAccount({ account_name: "", account_type: "", region: "" });
      const a = await api("/accounts");
      setAccounts(a);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleCreateCategory() {
    setError(null);
    try {
      if (!categoryDashboard) {
        setError("Select a dashboard for the category");
        return;
      }
      await api("/categories", {
        method: "POST",
        body: JSON.stringify({
          dashboard_id: categoryDashboard,
          name: newCategory.name
        })
      });
      setNewCategory({ name: "" });
      if (categoryDashboard) {
        const c = await api(`/categories?dashboard_id=${categoryDashboard}`);
        setCategories(c);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleAccount(account: any) {
    await api(`/accounts/${account.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        dashboard_id: accountDashboard || null,
        is_active: !account.is_active
      })
    });
    const a = await api("/accounts");
    setAccounts(a);
  }

  async function toggleCategory(category: any) {
    if (!categoryDashboard) {
      setError("Select a dashboard to manage categories");
      return;
    }
    await api(`/categories/${category.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        dashboard_id: categoryDashboard,
        is_active: !category.is_active
      })
    });
    const c = await api(`/categories?dashboard_id=${categoryDashboard}`);
    setCategories(c);
  }

  async function handleGrantAccess() {
    setError(null);
    try {
      await api(`/dashboards/${accessGrant.dashboard_id}/access`, {
        method: "POST",
        body: JSON.stringify(accessGrant)
      });
      setAccessGrant({ dashboard_id: "", target_user_id: "", can_view: true, can_edit: false });
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Governance Admin</h1>
      {error && <div style={{ color: "#ef6a62", marginBottom: 12 }}>{error}</div>}

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Create User (Admin)</h3>
          <div className="form-row">
            <input className="input" placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input className="input" placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <select className="select" value={newUser.manager_id} onChange={(e) => setNewUser({ ...newUser, manager_id: e.target.value })}>
              <option value="">No Manager</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <input className="input" placeholder="Level (1-5)" value={newUser.level} onChange={(e) => setNewUser({ ...newUser, level: e.target.value })} />
            <select className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <button className="button" onClick={handleCreateUser}>Create User</button>
        </div>

        <div className="card">
          <h3>Create Dashboard (Admin)</h3>
          <div className="form-row">
            <input className="input" placeholder="Name" value={newDashboard.name} onChange={(e) => setNewDashboard({ ...newDashboard, name: e.target.value })} />
            <input className="input" placeholder="Description" value={newDashboard.description} onChange={(e) => setNewDashboard({ ...newDashboard, description: e.target.value })} />
            <select className="select" value={newDashboard.primary_owner_id} onChange={(e) => setNewDashboard({ ...newDashboard, primary_owner_id: e.target.value })}>
              <option value="">Primary Owner</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select className="select" value={newDashboard.secondary_owner_id} onChange={(e) => setNewDashboard({ ...newDashboard, secondary_owner_id: e.target.value })}>
              <option value="">Secondary Owner</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <button className="button" onClick={handleCreateDashboard}>Create Dashboard</button>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Groups (Admin)</h3>
          <div className="form-row">
            <input className="input" placeholder="Group name" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
            <input className="input" placeholder="Description" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} />
          </div>
          <div className="inline-actions">
            <button className="button" onClick={handleCreateGroup}>Create Group</button>
          </div>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Name</th><th>Status</th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td><span className="badge">{g.is_active ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Assign Group to Dashboard (Admin)</h3>
          <div className="form-row">
            <select className="select" value={groupAssign.dashboard_id} onChange={(e) => setGroupAssign({ ...groupAssign, dashboard_id: e.target.value })}>
              <option value="">Dashboard</option>
              {dashboardOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select className="select" value={groupAssign.group_id} onChange={(e) => setGroupAssign({ ...groupAssign, group_id: e.target.value })}>
              <option value="">Group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <button className="button" onClick={handleAssignGroup}>Assign</button>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Accounts (Admin/Owner)</h3>
          <div className="form-row">
            <input className="input" placeholder="Account name" value={newAccount.account_name} onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })} />
            <input className="input" placeholder="Type" value={newAccount.account_type} onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value })} />
            <input className="input" placeholder="Region" value={newAccount.region} onChange={(e) => setNewAccount({ ...newAccount, region: e.target.value })} />
            <select className="select" value={accountDashboard} onChange={(e) => setAccountDashboard(e.target.value)}>
              <option value="">Dashboard (optional for Admin)</option>
              {dashboardOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button className="button" onClick={handleCreateAccount}>Create Account</button>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Region</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.account_name}</td>
                  <td>{a.account_type || "-"}</td>
                  <td>{a.region || "-"}</td>
                  <td><span className="badge">{a.is_active ? "Active" : "Inactive"}</span></td>
                  <td><button className="button" onClick={() => toggleAccount(a)}>{a.is_active ? "Deactivate" : "Activate"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Categories (Owner)</h3>
          <div className="form-row">
            <select className="select" value={categoryDashboard} onChange={(e) => setCategoryDashboard(e.target.value)}>
              <option value="">Dashboard</option>
              {dashboardOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input className="input" placeholder="Category name" value={newCategory.name} onChange={(e) => setNewCategory({ name: e.target.value })} />
          </div>
          <button className="button" onClick={handleCreateCategory}>Create Category</button>
          <table className="table" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Name</th><th>Status</th><th>Action</th></tr>
            </thead>
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
      </div>

      <div className="card">
        <h3>Dashboard Access (Owner)</h3>
        <div className="form-row">
          <select className="select" value={accessGrant.dashboard_id} onChange={(e) => setAccessGrant({ ...accessGrant, dashboard_id: e.target.value })}>
            <option value="">Dashboard</option>
            {dashboardOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select className="select" value={accessGrant.target_user_id} onChange={(e) => setAccessGrant({ ...accessGrant, target_user_id: e.target.value })}>
            <option value="">User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select className="select" value={accessGrant.can_view ? "yes" : "no"} onChange={(e) => setAccessGrant({ ...accessGrant, can_view: e.target.value === "yes" })}>
            <option value="yes">Can View</option>
            <option value="no">No View</option>
          </select>
          <select className="select" value={accessGrant.can_edit ? "yes" : "no"} onChange={(e) => setAccessGrant({ ...accessGrant, can_edit: e.target.value === "yes" })}>
            <option value="no">No Edit</option>
            <option value="yes">Can Edit</option>
          </select>
        </div>
        <button className="button" onClick={handleGrantAccess}>Grant Access</button>
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>User</th><th>Email</th><th>View</th><th>Edit</th></tr>
          </thead>
          <tbody>
            {accessList.map((a) => (
              <tr key={a.user_id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>{a.can_view ? "Yes" : "No"}</td>
                <td>{a.can_edit ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
