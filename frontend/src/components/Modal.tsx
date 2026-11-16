import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Centered pop-up dialog over a dimmed page. Closes on Escape or a click on
 * the backdrop; focuses its first field when it opens and restores focus on close.
 */
export function Modal({ title, onClose, children, footer, width = 560 }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // no background scrolling while open
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rendered into <body>: a parent with transform/filter/backdrop-filter (e.g.
  // the Frost theme's frosted cards) would otherwise trap the full-screen overlay.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel" role="dialog" aria-modal="true" ref={panel} style={{ maxWidth: width }}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
