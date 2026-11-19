import { Link } from "react-router-dom";

/** A task's title and details as shown in tables; the subject links to the task's page. */
export function TaskTitle({ task, showDetails = true }: { task: { id: string; title?: string | null; item_details?: string | null }; showDetails?: boolean }) {
  const to = `/tasks/${task.id}`;
  if (task.title) {
    return (
      <>
        <div><Link to={to} className="task-link" style={{ fontWeight: 700 }}>{task.title}</Link></div>
        {showDetails && task.item_details && <div>{task.item_details}</div>}
      </>
    );
  }
  return <div><Link to={to} className="task-link">{task.item_details}</Link></div>;
}
