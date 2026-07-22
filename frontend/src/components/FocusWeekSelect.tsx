import { getUpcomingWeekStarts, formatWeekLabel } from "../lib/weeks";

interface FocusWeekSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const WEEKS = getUpcomingWeekStarts(12);

export function FocusWeekSelect({ value, onChange, disabled }: FocusWeekSelectProps) {
  return (
    <select className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Focus Week — none</option>
      {WEEKS.map((w) => <option key={w} value={w}>{formatWeekLabel(w)}</option>)}
    </select>
  );
}
