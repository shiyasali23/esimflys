"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Publishes its own height as `--consent-banner-h` so the buy bars pinned to the
 * bottom of the plan and checkout screens can sit above it instead of under it.
 *
 * Without this they collide: the banner is z-70 and the bars are z-30, so a
 * first-time visitor — exactly the person about to buy — sees a cookie notice where
 * the pay button should be. Raising the bars instead would only reverse who is
 * buried, so the two stack.
 */
export function ConsentBanner() {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => c.startsWith("consent="));
    if (!has) setShow(true);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!show || !ref.current) {
      root.style.removeProperty("--consent-banner-h");
      return undefined;
    }
    const publish = () =>
      root.style.setProperty("--consent-banner-h", `${ref.current.offsetHeight}px`);
    publish();
    // The copy wraps to two lines on a narrow screen, so the height is not a constant.
    const observer = new ResizeObserver(publish);
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--consent-banner-h");
    };
  }, [show]);

  function choose(value) {
    document.cookie = `consent=${value}; path=/; max-age=31536000; samesite=lax`;
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-background/95 p-4 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use an essential cookie to remember your currency. Analytics stays off unless you accept.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => choose("declined")}>
            Decline
          </Button>
          <Button variant="cta" size="sm" onClick={() => choose("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
