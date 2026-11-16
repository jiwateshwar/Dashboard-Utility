/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** "auto" (default: Frost theme Dec–Feb), "frost" (always) or "off". */
  readonly VITE_SEASONAL_THEME?: string;
}
