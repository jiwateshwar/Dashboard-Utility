// Task statuses treated as terminal/closed+accepted for reporting, escalation, and archival purposes.
export const CLOSED_TASK_STATUSES = ["Closed Accepted", "Dropped"] as const;

export function isClosedTaskStatus(status: string): boolean {
  return (CLOSED_TASK_STATUSES as readonly string[]).includes(status);
}
