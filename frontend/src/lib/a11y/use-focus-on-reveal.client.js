"use client";
import { useCallback, useRef } from "react";

/**
 * Move focus into a step that appears in response to a click.
 *
 * Revealing a confirm step or an inline form usually unmounts the control that
 * triggered it. When that happens the browser drops focus to `<body>`, so a
 * keyboard user is silently returned to the top of the document and has to tab
 * back through the whole page. A screen-reader user gets no announcement that
 * anything appeared at all.
 *
 * Attach the returned ref to the revealed element. It focuses on mount, so React
 * running the ref callback IS the signal — no effect, no timer, no dependency on
 * the caller remembering to fire something.
 *
 * The target must be focusable: a real control, or a container with tabIndex={-1}.
 * Prefer a container for destructive steps — landing directly on "Confirm" invites
 * an accidental Enter.
 */
export function useFocusOnReveal() {
  const focused = useRef(false);

  return useCallback((node) => {
    if (!node) {
      focused.current = false;
      return;
    }
    if (focused.current) return;
    focused.current = true;
    node.focus();
  }, []);
}
