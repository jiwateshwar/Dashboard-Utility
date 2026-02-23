import { useState } from "react";
import { api } from "../api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [rag, setRag] = useState("");
  const [aging, setAging] = useState("");

  async function runSearch() {
    if (!query) return;
    const params = new URLSearchParams();
    params.set("q", query);
    if (status) params.set("status", status);
    if (rag) params.set("rag", rag);
    if (aging) params.set("aging_gt", aging);
    const data = await api(`/search?${params.toString()}`);
    setResults(data);
  }

  return (
    <div>
      <h1>Global Search</h1>
      <div className="form-row">
        <input className="input" placeholder="Search tasks, risks, decisions..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any Status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed Pending Approval">Closed Pending Approval</option>
          <option value="Closed Accepted">Closed Accepted</option>
          <option value="Mitigated">Mitigated</option>
          <option value="Closed">Closed</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="Deferred">Deferred</option>
        </select>
        <select className="select" value={rag} onChange={(e) => setRag(e.target.value)}>
          <option value="">Any RAG</option>
          <option value="Green">Green</option>
          <option value="Amber">Amber</option>
          <option value="Red">Red</option>
        </select>
        <input className="input" placeholder="Aging > days" value={aging} onChange={(e) => setAging(e.target.value)} />
      </div>
      <button className="button" onClick={runSearch}>Search</button>
      {results && (
        <div className="grid two">
          <div className="card">
            <h3>Tasks</h3>
            {results.tasks.map((t: any) => (
              <div key={t.id}>{t.title}</div>
            ))}
          </div>
          <div className="card">
            <h3>Risks</h3>
            {results.risks.map((r: any) => (
              <div key={r.id}>{r.title}</div>
            ))}
          </div>
          <div className="card">
            <h3>Decisions</h3>
            {results.decisions.map((d: any) => (
              <div key={d.id}>{d.title}</div>
            ))}
          </div>
          <div className="card">
            <h3>Accounts</h3>
            {results.accounts.map((a: any) => (
              <div key={a.id}>{a.title}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
