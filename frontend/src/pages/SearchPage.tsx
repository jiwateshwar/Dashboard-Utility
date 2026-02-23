import { useState } from "react";
import { api } from "../api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);

  async function runSearch() {
    if (!query) return;
    const data = await api(`/search?q=${encodeURIComponent(query)}`);
    setResults(data);
  }

  return (
    <div>
      <h1>Global Search</h1>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input className="input" placeholder="Search tasks, risks, decisions..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="button" onClick={runSearch}>Search</button>
      </div>
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
