import { useEffect, useState } from "react";
import { api } from "../api";
import { PendingApprovalRow } from "./PendingApprovalRow";

/**
 * Closure requests waiting on the signed-in user. Each item expands for
 * details and its own Approve / Reject; checkboxes drive bulk Approve and
 * Reject (with one shared reason) through POST /tasks/closure-decisions.
 */
export function ApprovalQueue({ items, onChanged }: { items: any[]; onChanged: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Drop selections for items that are no longer in the list (approved elsewhere, etc.).
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => items.some((t) => t.id === id))));
  }, [items]);

  const decidable = items.filter((t) => t.can_approve);
  const allSelected = decidable.length > 0 && decidable.every((t) => selected.has(t.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(decidable.map((t) => t.id)));

  async function bulk(action: "approve" | "reject") {
    setBusy(action); setMsg(null);
    try {
      const r = await api("/tasks/closure-decisions", { method: "POST", body: JSON.stringify({ ids: [...selected], action, reason: action === "reject" ? reason : undefined }) });
      const verb = action === "approve" ? "Approved" : "Rejected and reopened";
      setMsg({ ok: r.failed.length === 0, text: `${verb} ${r.done} task${r.done === 1 ? "" : "s"}.${r.failed.length ? ` ${r.failed.length} could not be changed: ${r.failed[0].error}` : ""}` });
      setSelected(new Set()); setRejecting(false); setReason("");
      onChanged();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || "Failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Pending Approvals</h3>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>{items.length} waiting on you</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
        Closure requests on tasks you created. Approve to close them, or reject to send them back to Open. Anything left for 3 weeks closes automatically.
      </div>

      {items.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Nothing is waiting for your approval.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0" }}>
            <label style={{ fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={decidable.length === 0} />
              Select all
            </label>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{selected.size} selected</span>
            <button className="button" disabled={selected.size === 0 || !!busy} onClick={() => bulk("approve")}>
              {busy === "approve" ? "Approving…" : `Approve${selected.size ? ` (${selected.size})` : ""}`}
            </button>
            <button className="button secondary" disabled={selected.size === 0 || !!busy} onClick={() => setRejecting((v) => !v)}>
              Reject{selected.size ? ` (${selected.size})` : ""}
            </button>
          </div>
          {rejecting && selected.size > 0 && (
            <div style={{ display: "grid", gap: 6, maxWidth: 560, marginBottom: 8 }}>
              <textarea className="input" rows={2} placeholder="Why are these closures rejected? (optional — sent to the owners)" value={reason}
                onChange={(e) => setReason(e.target.value)} maxLength={1000} style={{ resize: "vertical", fontSize: 13 }} />
              <div className="inline-actions">
                <button className="button danger" onClick={() => bulk("reject")} disabled={!!busy}>{busy === "reject" ? "Rejecting…" : `Reject & reopen ${selected.size}`}</button>
                <button className="button secondary" onClick={() => setRejecting(false)} disabled={!!busy}>Cancel</button>
              </div>
            </div>
          )}
          {msg && <div style={{ fontSize: 13, color: msg.ok ? "#2ebd85" : "#ef6a62", marginBottom: 6 }}>{msg.text}</div>}
          {items.map((t) => (
            <PendingApprovalRow key={t.id} t={t} showOwner onChanged={onChanged}
              selectable={!!t.can_approve} selected={selected.has(t.id)} onToggle={toggle} />
          ))}
        </>
      )}
    </div>
  );
}
