const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday of the week containing `d` (local time). */
function mondayOf(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

/** Returns ISO date strings (yyyy-mm-dd) for the Monday of the current week plus the next `count - 1` weeks. */
export function getUpcomingWeekStarts(count = 12): string[] {
  const start = mondayOf(new Date());
  const weeks: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    weeks.push(toIsoDate(d));
  }
  return weeks;
}

/** "Week of Jul 21" for an ISO date string. */
export function formatWeekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `Week of ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

