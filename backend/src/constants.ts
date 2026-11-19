// Task statuses treated as terminal/closed+accepted for reporting, escalation, and archival purposes.
export const CLOSED_TASK_STATUSES = ["Closed Accepted", "Dropped"] as const;

export function isClosedTaskStatus(status: string): boolean {
  return (CLOSED_TASK_STATUSES as readonly string[]).includes(status);
}

// Task statuses that can never be overdue: closed ones, ones awaiting closure
// approval, and Parked (on hold — still open, but its due date isn't chased).
export const NO_OVERDUE_TASK_STATUSES = [...CLOSED_TASK_STATUSES, "Closed Pending Approval", "Parked"] as const;

export function canBeOverdue(status: string): boolean {
  return !(NO_OVERDUE_TASK_STATUSES as readonly string[]).includes(status);
}
