import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { HashtagChips } from "./HashtagChips";

const d10 = (s?: string) => (s ? s.slice(0, 10) : "—");

function daysUntil(ts?: string) {
  if (!ts) return null;
  return Math.ceil((new Date(ts).getTime() - Date.now()) / 86400000);
}

/**
 * One task awaiting closure approval. Click to expand its details and act:
 * Approve closure, or Reject closure (task goes back to Open, owners are told
 * why) — both only for the creator/admin, same rule as the server — or open
 * its dashboard. With `selectable`, a checkbox feeds the bulk actions.
 */
export function PendingApprovalRow({ t, onChanged, showOwner, selectable, selected, onToggle }: {
  t: any; onChanged: () => void; showOwner?: boolean;
  selectable?: boolean; selected?: boolean; onToggle?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err: any) {
      setError(err.message || "Action failed");
    } finally {
      setBusy(null);
    }
  }
  const approve = () => act("approve", () => api(`/tasks/${t.id}/approve`, { method: "POST" }));
  const reject = () => act("reject", () => api(`/tasks/${t.id}/reject-closure`, { method: "POST", body: JSON.stringify({ reason }) }));

  const autoIn = daysUntil(t.auto_close_at);
  const owners = Array.isArray(t.owner_names) ? t.owner_names.filter(Boolean).join(", ") : "—";

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: selected ? "rgba(29,99,237,0.05)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={() => onToggle?.(t.id)} aria-label={`Select ${t.title || t.item_details}`} style={{ flexShrink: 0 }} />
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen((v) => !v); } }}
          aria-expanded={open}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flex: 1, minWidth: 0,
            padding: "10px 0", background: "none", border: 0, cursor: "pointer", textAlign: "left", color: "inherit", font: "inherit"
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              <Link to={`/tasks/${t.id}`} className="task-link" onClick={(e) => e.stopPropagation()}>{t.title || t.item_details}</Link>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {t.dashboard_name}
              {showOwner && owners !== "—" && ` · ${owners}`}
              {t.closure_requested_at && ` · Requested ${d10(t.closure_requested_at)}`}
              {autoIn !== null && autoIn >= 0 && ` · Auto-closes in ${autoIn}d`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span className="tag amber">Awaiting Approval</span>
            <span aria-hidden style={{ color: "var(--muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {open && (
        <div style={{ padding: `4px 0 14px ${selectable ? 24 : 0}px` }}>
          {t.title && t.item_details && <div style={{ fontSize: 13, marginBottom: 10, whiteSpace: "pre-wrap" }}>{t.item_details}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "6px 16px", fontSize: 12, marginBottom: 10 }}>
            <div><span style={{ color: "var(--muted)" }}>Dashboard</span><br />{t.dashboard_name}</div>
            <div><span style={{ color: "var(--muted)" }}>Account</span><br />{t.account_name || "—"}</div>
            <div><span style={{ color: "var(--muted)" }}>Owner(s)</span><br />{owners}</div>
            <div><span style={{ color: "var(--muted)" }}>Created by</span><br />{t.created_by_name || "—"}</div>
            <div><span style={{ color: "var(--muted)" }}>Due</span><br />{d10(t.target_date)}</div>
            <div><span style={{ color: "var(--muted)" }}>Closure requested</span><br />{d10(t.closure_requested_at)}</div>
            {t.auto_close_at && (
              <div>
                <span style={{ color: "var(--muted)" }}>Closes automatically</span><br />
                {d10(t.auto_close_at)}{autoIn !== null && autoIn >= 0 ? ` (in ${autoIn}d)` : ""}
              </div>
            )}
          </div>
          {Array.isArray(t.tags) && t.tags.length > 0 && <div style={{ marginBottom: 10 }}><HashtagChips tags={t.tags} /></div>}
          {error && <div style={{ color: "#ef6a62", fontSize: 13, marginBottom: 8 }}>{error}</div>}
          {rejecting ? (
            <div style={{ display: "grid", gap: 6, maxWidth: 520 }}>
              <textarea className="input" rows={2} placeholder="Why is the closure rejected? (optional — sent to the owners)" value={reason}
                onChange={(e) => setReason(e.target.value)} maxLength={1000} style={{ resize: "vertical", fontSize: 13 }} />
              <div className="inline-actions">
                <button className="button danger" onClick={reject} disabled={!!busy}>{busy === "reject" ? "Rejecting…" : "Reject & reopen"}</button>
                <button className="button secondary" onClick={() => setRejecting(false)} disabled={!!busy}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="inline-actions">
              {t.can_approve ? (
                <>
                  <button className="button" onClick={approve} disabled={!!busy}>{busy === "approve" ? "Approving…" : "Approve closure"}</button>
                  <button className="button secondary" onClick={() => setRejecting(true)} disabled={!!busy}>Reject closure</button>
                </>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Only {t.created_by_name || "the creator"} (or an admin) can approve this closure.</span>
              )}
              <Link className="button secondary" to={`/tasks/${t.id}`} style={{ textDecoration: "none" }}>Open task</Link>
              <Link className="button secondary" to={`/dashboards/${t.dashboard_id}`} style={{ textDecoration: "none" }}>Open dashboard</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
