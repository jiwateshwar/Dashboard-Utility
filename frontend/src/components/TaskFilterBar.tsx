import { useEffect, useMemo, useState } from "react";
import { ComboBox } from "./ComboBox";
import { getUpcomingWeekStarts, formatWeekLabel } from "../lib/weeks";

const STATUS_OPTIONS = ["Open", "In Progress", "Closed Pending Approval", "Closed Accepted", "Dropped"];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "target_date", label: "Due Date" },
  { value: "created_at", label: "Created Date" },
  { value: "focus_week_start", label: "Focus Week" },
  { value: "status", label: "Status" }
];

interface TaskFilterBarProps {
  tasks: any[];
  users: any[];
  accounts: any[];
  onFilteredChange: (filtered: any[]) => void;
}

function taskOwnerIds(t: any): string[] {
  if (Array.isArray(t.owner_ids) && t.owner_ids.length > 0) return t.owner_ids;
  return t.owner_id ? [t.owner_id] : [];
}

export function TaskFilterBar({ tasks, users, accounts, onFilteredChange }: TaskFilterBarProps) {
  const [createdBy, setCreatedBy] = useState<string[]>([]);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [focusWeek, setFocusWeek] = useState("");
  const [status, setStatus] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("target_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const userOptions = useMemo(() => users.map((u) => ({ id: u.id, label: u.name })), [users]);
  const accountOptions = useMemo(() => accounts.map((a) => ({ id: a.id, label: a.account_name })), [accounts]);
  const tagOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tasks) for (const tag of t.tags ?? []) seen.add(tag);
    return [...seen].sort().map((tag) => ({ id: tag, label: `#${tag}` }));
  }, [tasks]);
  const weekOptions = useMemo(() => getUpcomingWeekStarts(12), []);

  const filtered = useMemo(() => {
    let result = tasks.filter((t) => {
      if (createdBy.length > 0 && !createdBy.includes(t.created_by)) return false;
      if (ownerIds.length > 0 && !taskOwnerIds(t).some((o) => ownerIds.includes(o))) return false;
      if (focusWeek === "__none__" && t.focus_week_start) return false;
      if (focusWeek && focusWeek !== "__none__" && t.focus_week_start?.slice(0, 10) !== focusWeek) return false;
      if (status && t.status !== status) return false;
      if (tags.length > 0 && !(t.tags ?? []).some((tag: string) => tags.includes(tag))) return false;
      if (accountIds.length > 0 && !accountIds.includes(t.account_id)) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      let av: string, bv: string;
      if (sortBy === "target_date") { av = a.target_date ?? ""; bv = b.target_date ?? ""; }
      else if (sortBy === "created_at") { av = a.created_at ?? ""; bv = b.created_at ?? ""; }
      else if (sortBy === "focus_week_start") { av = a.focus_week_start ?? ""; bv = b.focus_week_start ?? ""; }
      else { av = a.status ?? ""; bv = b.status ?? ""; }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [tasks, createdBy, ownerIds, focusWeek, status, tags, accountIds, sortBy, sortDir]);

  useEffect(() => { onFilteredChange(filtered); }, [filtered, onFilteredChange]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="form-row" style={{ marginBottom: 8 }}>
        <ComboBox options={userOptions} selectedIds={createdBy} onChange={setCreatedBy} placeholder="Created By" />
        <ComboBox options={userOptions} selectedIds={ownerIds} onChange={setOwnerIds} placeholder="Owner / Due To" multi />
        <select className="select" value={focusWeek} onChange={(e) => setFocusWeek(e.target.value)}>
          <option value="">Focus Week — all</option>
          <option value="__none__">Unassigned</option>
          {weekOptions.map((w) => <option key={w} value={w}>{formatWeekLabel(w)}</option>)}
        </select>
      </div>
      <div className="form-row">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status — all</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <ComboBox options={tagOptions} selectedIds={tags} onChange={setTags} placeholder="Hashtag" multi />
        <ComboBox options={accountOptions} selectedIds={accountIds} onChange={setAccountIds} placeholder="Account" multi />
        <select className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
        </select>
        <button className="button secondary" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
      </div>
    </div>
  );
}
