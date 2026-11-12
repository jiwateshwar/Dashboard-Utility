import { useEffect } from "react";
import { api } from "../api";

const PING_EVERY_MS = 60_000;

/**
 * Tells the server the user is actually using the app — scrolling, clicking,
 * typing or touching a visible page — at most once a minute. Powers "Last
 * activity" on the Access Logs page and the "online" count. An idle open tab
 * sends nothing.
 */
export function useActivityPing(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const onActivity = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < PING_EVERY_MS) return;
      last = now;
      api("/activity/ping", { method: "POST" }).catch(() => { /* offline or logged out — ignore */ });
    };
    // capture:true so scrolling inside inner panels/tables counts, not just the window.
    const events = ["scroll", "click", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", onActivity);
    onActivity(); // opening/reloading a page counts as activity
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity, { capture: true } as any));
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, [enabled]);
}
