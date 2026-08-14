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
  /*
   * Starts SHOWN, so the banner is in the server-rendered HTML and paints with the rest
   * of the page. It used to start hidden and appear only after an effect read the cookie,
   * which meant it arrived after the page's own heading — and because its paragraph is a
   * bigger text block than any h1 on the site, it then became the Largest Contentful Paint
   * element and reset the LCP clock.
   *
   * [MEASURED] /esim/turkey, Slow 4G, warm cache, only the `consent` cookie changed:
   *     banner shown       FCP 888 ms  ->  LCP 1036 ms   (LCP element = this paragraph)
   *     banner suppressed  FCP 852 ms  ->  LCP  852 ms   (LCP element = h1)
   * Cold and CPU-throttled the same gap was 1164 ms, since it is however long hydration
   * takes. Googlebot and every first-time visitor arrive with no cookie, so the inflated
   * number is the one that gets measured.
   *
   * Returning visitors do not see it flash: `NoFlashConsentScript` sets
   * `<html data-consent="1">` before paint and globals.css hides it on that attribute.
   * The effect below then unmounts it, purely so it leaves the accessibility tree — by
   * that point CSS has already made it invisible, so nothing moves on screen.
   *
   * `show` must start `true` on the client too, or the first client render would disagree
   * with the server HTML and React would throw a hydration mismatch.
   */
  const [show, setShow] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => c.startsWith("consent="));
    if (has) setShow(false);
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
      data-consent-banner=""
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border bg-background/95 p-4 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use an essential cookie to remember your currency. Analytics stays off unless you accept.
        </p>
        {/*
          `md` (h-11, 44 px), not `sm` (h-9, 36 px). These two are the only way to dismiss
          a banner pinned over the bottom of every page, so a missed tap leaves it covering
          the buy bar — the exact collision the height-publishing effect above exists to
          prevent.
        */}
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="md" onClick={() => choose("declined")}>
            Decline
          </Button>
          <Button variant="cta" size="md" onClick={() => choose("accepted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
