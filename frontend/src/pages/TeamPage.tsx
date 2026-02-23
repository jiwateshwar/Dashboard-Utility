import { useEffect, useState } from "react";
import { api } from "../api";

export default function TeamPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api("/team").then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1>Team View</h1>
      <div className="grid two">
        <div className="card">
          <h3>Tasks</h3>
          {data.tasks.map((t: any) => (
            <div key={t.id}>{t.item_details}</div>
          ))}
        </div>
        <div className="card">
          <h3>Risks</h3>
          {data.risks.map((r: any) => (
            <div key={r.id}>{r.risk_title}</div>
          ))}
        </div>
        <div className="card">
          <h3>Decisions</h3>
          {data.decisions.map((d: any) => (
            <div key={d.id}>{d.decision_title}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
