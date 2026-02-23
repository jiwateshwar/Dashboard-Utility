import { useEffect, useState } from "react";
import { api } from "../api";

export default function PersonalPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api("/personal").then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1>My Work</h1>
      <div className="grid two">
        <div className="card">
          <h3>My Tasks</h3>
          {data.tasks.map((t: any) => (
            <div key={t.id}>{t.item_details}</div>
          ))}
        </div>
        <div className="card">
          <h3>My Risks</h3>
          {data.risks.map((r: any) => (
            <div key={r.id}>{r.risk_title}</div>
          ))}
        </div>
        <div className="card">
          <h3>My Decisions</h3>
          {data.decisions.map((d: any) => (
            <div key={d.id}>{d.decision_title}</div>
          ))}
        </div>
        <div className="card">
          <h3>My Escalations</h3>
          {data.escalations.map((e: any) => (
            <div key={e.id}>{e.message}</div>
          ))}
        </div>
        <div className="card">
          <h3>My Pending Approvals</h3>
          {data.pendingApprovals.map((t: any) => (
            <div key={t.id}>{t.item_details}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
