import { useState } from "react";
import { api } from "../api";

/**
 * "Request update" for an escalation: emails the people the item is waiting
 * on, with the requester in CC (and in-app). Opens a small note box first.
 * Disabled while the 24-hour cooldown runs or once the item is closed.
 */
export function RequestUpdateButton({ escalation, onDone }: { escalation: any; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (!escalation.is_open) return <span style={{ fontSize: 12, color: "var(--muted)" }}>Closed</span>;
  const who = (escalation.pending ?? []).map((p: any) => p.name).join(", ") || "the owner";

  if (!escalation.can_request_update && !result) {
    const next = escalation.next_request_allowed_at ? new Date(escalation.next_request_allowed_at) : null;
    return (
      <span style={{ fontSize: 12, color: "var(--muted)" }} title={next ? `You can ask again after ${next.toLocaleString()}` : undefined}>
        Update requested{escalation.last_update_requested_at ? ` ${new Date(escalation.last_update_requested_at).toLocaleDateString()}` : ""}
      </span>
    );
  }
  if (result) return <span style={{ fontSize: 12, color: result.ok ? "#2ebd85" : "#ef6a62" }}>{result.text}</span>;

  async function send() {
    setBusy(true);
    try {
      const r = await api(`/escalations/${escalation.id}/request-update`, { method: "POST", body: JSON.stringify({ note }) });
      setResult({ ok: true, text: r.message });
      onDone?.();
    } catch (err: any) {
      setResult({ ok: false, text: err.message || "Failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12, whiteSpace: "nowrap" }} onClick={() => setOpen(true)}>
        Request update
      </button>
    );
  }
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 240 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Emails {who}, with you in CC.</div>
      <textarea className="input" rows={2} placeholder="Optional note (e.g. what you need by when)" value={note}
        onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ resize: "vertical", fontSize: 13 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="button" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={send} disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
