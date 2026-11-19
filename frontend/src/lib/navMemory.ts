// Remembers where the user was on each page, so Back (our button or the
// browser's) returns them to the same tab, filters and scroll position.
//
// Everything is keyed by React Router's location.key, which is unique per
// history entry: going Back re-enters the same entry (same key) and finds its
// saved state; opening the same page fresh gets a new key and starts clean.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

const PREFIX = "nav:";

function read<T>(k: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(k);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}
function write(k: string, v: unknown) {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked — state just won't survive Back */
  }
}

/** useState that survives leaving the page and coming Back to it. */
export function useRememberedState<T>(name: string, initial: T | (() => T)) {
  const { key } = useLocation();
  const storageKey = `${PREFIX}${key}:${name}`;
  const [value, setValue] = useState<T>(() => {
    const saved = read<T>(storageKey);
    if (saved !== undefined) return saved;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    write(storageKey, value);
  }, [storageKey, value]);
  return [value, setValue] as const;
}

/**
 * Mount once inside the router. Saves the window's scroll position for each
 * history entry; on Back/Forward restores it (waiting for the page's data to
 * load and grow tall enough), and on a normal navigation starts at the top.
 */
export function ScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write(`${PREFIX}${keyRef.current}:scroll`, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    keyRef.current = location.key;
    if (navType !== "POP") {
      if (!location.hash) window.scrollTo(0, 0);
      return;
    }
    const target = read<number>(`${PREFIX}${location.key}:scroll`) ?? 0;
    if (target <= 0) {
      window.scrollTo(0, 0);
      return;
    }
    // The page refetches its data, so keep trying until it's tall enough
    // (or ~5s pass), and stop as soon as the user scrolls themselves.
    let cancelled = false;
    const stop = () => { cancelled = true; };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (cancelled || Date.now() - started > 5000) return finish();
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(target, max));
      if (max >= target && Math.abs(window.scrollY - target) < 2) {
        // Hold the position briefly in case late content shifts the page.
        if (Date.now() - started > 600) finish();
      }
    }, 50);
    function finish() {
      window.clearInterval(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    }
    return finish;
  }, [location.key, navType]);

  return null;
}

/**
 * Back to wherever the user came from inside PRISM; if they arrived straight
 * from an email or a bookmark there's no in-app history, so go to `fallback`.
 */
export function useBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
