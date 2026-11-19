import { useState } from "react";
import { api } from "../api";

const shortDate = (d: string | Date) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * "Request update" for an escalation: emails the people the item is waiting
 * on, with the requester in CC (and in-app). Opens a small note box first.
 * Can be sent again any time; repeats are labelled "Second reminder",
 * "Third reminder"... (label comes from the server as next_request_label).
 */
export function RequestUpdateButton({ escalation, onDone }: { escalation: any; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Updated straight from the send response so the label moves on even before the list reloads.
  const [sent, setSent] = useState<{ count: number; label: string; at: Date } | null>(null);

  if (!escalation.is_open) return <span style={{ fontSize: 12, color: "var(--muted)" }}>Closed</span>;
  const who = (escalation.pending ?? []).map((p: any) => p.name).join(", ") || "the owner";

  const serverCount = Number(escalation.reminder_count ?? 0);
  const useLocal = sent && sent.count > serverCount;
  const count = useLocal ? sent!.count : serverCount;
  const label: string = useLocal ? sent!.label : escalation.next_request_label ?? (count === 0 ? "Request update" : "Send reminder");
  const lastAt = useLocal ? sent!.at : escalation.last_update_requested_at;
  const isRepeat = count > 0;

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api(`/escalations/${escalation.id}/request-update`, { method: "POST", body: JSON.stringify({ note }) });
      setResult({ ok: true, text: r.message });
      setSent({ count: r.reminder_count, label: r.next_request_label, at: new Date() });
      setOpen(false);
      setNote("");
      onDone?.();
    } catch (err: any) {
      setResult({ ok: false, text: err.message || "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const status = (
    <>
      {result && <div style={{ fontSize: 12, color: result.ok ? "#2ebd85" : "#ef6a62" }}>{result.text}</div>}
      {!result && isRepeat && lastAt && (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>
          {count === 1 ? "Requested" : `${count} requests sent`} · last {shortDate(lastAt)}
        </div>
      )}
    </>
  );

  if (!open) {
    return (
      <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
        <button
          className="button secondary"
          style={{ height: 30, padding: "0 10px", fontSize: 12, whiteSpace: "nowrap", ...(isRepeat ? { borderColor: "#f5a623", color: "#b26a00" } : {}) }}
          onClick={() => { setResult(null); setOpen(true); }}
        >
          {label}
        </button>
        {status}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 240 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {isRepeat ? <><strong>{label}</strong>: emails {who} again, with you in CC.</> : <>Emails {who}, with you in CC.</>}
      </div>
      <textarea className="input" rows={2} placeholder="Optional note (e.g. what you need by when)" value={note}
        onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ resize: "vertical", fontSize: 13 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button className="button" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={send} disabled={busy}>
          {busy ? "Sending…" : isRepeat ? `Send ${label.toLowerCase()}` : "Send request"}
        </button>
        <button className="button secondary" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
      {result && !result.ok && <div style={{ fontSize: 12, color: "#ef6a62" }}>{result.text}</div>}
    </div>
  );
}
