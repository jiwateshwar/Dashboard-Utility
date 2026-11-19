/**
 * Seasonal look. Not a user setting: the Frost (winter) theme switches on by
 * itself from 19 November to the end of February, judged by the viewer's
 * clock. The build setting VITE_SEASONAL_THEME can force it: "auto"
 * (default, by date), "frost" (always on, e.g. to preview it) or "off".
 */
type Mode = "auto" | "frost" | "off";

// Season starts on this day of November (month index 10).
const FROST_START_NOV_DAY = 19;

export function isWinter(d = new Date()): boolean {
  const m = d.getMonth(); // 0 = January
  if (m === 10) return d.getDate() >= FROST_START_NOV_DAY; // late November
  return m === 11 || m === 0 || m === 1; // December, January, February
}

export function applySeasonalTheme(now = new Date()): string | null {
  const raw = String(import.meta.env.VITE_SEASONAL_THEME ?? "auto").toLowerCase();
  const mode: Mode = raw === "frost" || raw === "off" ? raw : "auto";
  const theme = mode === "frost" || (mode === "auto" && isWinter(now)) ? "frost" : null;
  document.documentElement.classList.toggle("theme-frost", theme === "frost");
  return theme;
}
