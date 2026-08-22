"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The buy bars pinned to the bottom of the plan and checkout screens sit above this
 * banner using `--consent-banner-h`, which is reserved in globals.css.
 *
 * Without that reservation they collide: the banner is z-70 and the bars are z-30, so a
 * first-time visitor — exactly the person about to buy — sees a cookie notice where the
 * pay button should be. Raising the bars instead would only reverse who is buried, so the
 * two stack. The height used to be measured here at runtime; see the note below the
 * cookie effect for why it no longer is.
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

  useEffect(() => {
    const has = document.cookie.split("; ").some((c) => c.startsWith("consent="));
    if (has) setShow(false);
  }, []);

  /*
   * There is deliberately NO ResizeObserver here any more.
   *
   * This component used to measure itself and publish `--consent-banner-h` on <html>. That
   * could only happen after hydration, so the server HTML had the variable unset, the buy
   * bar painted at the bottom of the viewport, and then jumped 129 px once JS ran —
   * [MEASURED] CLS 0.062 on a cold load of /esim/turkey, at 3911 ms.
   *
   * The height is now reserved in globals.css, which is correct at first paint. It can be,
   * because the banner is fixed copy: its height is a function of viewport width alone
   * (149px / 129px / 77px at the three breakpoints), so nothing needs measuring at runtime.
   *
   * If the copy ever changes, re-measure and update BOTH the `min-h` utilities on the
   * banner and the `--consent-banner-h` values in globals.css. Reserving too little puts
   * the cookie notice on top of the pay button, which is the collision this whole
   * arrangement exists to prevent.
   */

  /*
   * The `data-consent` attribute is updated here as well as in `NoFlashConsentScript`,
   * and that second write is load-bearing rather than tidy-up.
   *
   * `--consent-banner-h` in globals.css is keyed on `:root[data-consent="1"]`, and the
   * buy bars on the plan and checkout screens sit at `bottom: var(--consent-banner-h)`.
   * The pre-paint script only runs on a FULL page load, so on the load where someone
   * actually accepts, the attribute stays "0" — the banner unmounts on the line below,
   * but 129px of space stays reserved underneath it for a banner that is no longer
   * there. Every soft navigation after that keeps the stale value, because the App
   * Router never re-runs the inline script.
   *
   * [MEASURED] 390x844, accept the banner, then open /esim/saudi-arabia or /checkout:
   * the buy bar renders with `bottom: 129px`, floating in the middle of the screen with
   * a strip of page scrolling underneath it. Reproduced from the reported iPhone
   * screenshots, where the gap under the bar measured 129 CSS px exactly.
   *
   * Writing the attribute here makes the two paths agree without a second full load.
   */
  function choose(value) {
    document.cookie = `consent=${value}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.setAttribute("data-consent", "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      data-consent-banner=""
      /*
        `min-h` matches the `--consent-banner-h` reservation in globals.css exactly. The
        space is reserved in CSS at first paint; this pins the banner to fill it, so the
        buy bar never sits above a short banner with a visible strip of page between them.
        Measured heights: 149px at 320px wide, 129px from 360px, 77px from 640px. Change
        one of these and you must change the other.
      */
      className="fixed inset-x-0 bottom-0 z-[70] min-h-[149px] border-t border-border bg-background/95 p-4 min-[360px]:min-h-[129px] sm:min-h-[77px]"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use an essential cookie to remember your currency. Analytics stays off unless you accept.
        </p>
        {/*
          `md` (h-11, 44 px), not `sm` (h-9, 36 px). These two are the only way to dismiss
          a banner pinned over the bottom of every page, so a missed tap leaves it covering
          the buy bar — the exact collision the height reservation exists to prevent.
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
