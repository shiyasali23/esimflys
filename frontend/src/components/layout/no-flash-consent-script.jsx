/**
 * Decides before first paint whether the consent banner is visible.
 *
 * Same shape as `NoFlashCurrencyScript`, and for a related but distinct reason. That one
 * exists to stop prices repainting. This one exists because the banner was the Largest
 * Contentful Paint element on every page a first-time visitor loaded.
 *
 * The banner used to render only after hydration (`useState(false)` + an effect reading
 * the cookie), so it appeared well after the page's own heading — and its paragraph is a
 * larger text block than any `<h1>` on the site, so the moment it appeared it took over
 * as the LCP element and reset the clock.
 *
 * [MEASURED] /esim/turkey, Slow 4G, warm cache, changing only the `consent` cookie:
 *
 *     banner shown       FCP 888 ms   LCP 1036 ms   (LCP element = banner paragraph)
 *     banner suppressed  FCP 852 ms   LCP  852 ms   (LCP element = h1)
 *
 * On a cold, CPU-throttled load the same gap was 1164 ms (FCP 2404 -> LCP 3568), because
 * the gap is however long hydration takes.
 *
 * This matters for search specifically: Googlebot and every real first-time visitor
 * arrive with no `consent` cookie, so the banner-inflated number is the one that gets
 * measured — the suppressed case is only ever seen by returning visitors.
 *
 * With the banner in the server-rendered HTML it paints with everything else, so it is
 * still the LCP element but is no longer *late*. This script then hides it for anyone who
 * has already chosen, before paint, so they never see it flash.
 *
 * Failure mode is deliberately the safe one: if the cookie cannot be read, `data-consent`
 * is set to `"0"` and the banner shows. Showing a consent notice to someone who already
 * answered is a small annoyance; hiding it from someone who has not is a compliance
 * problem.
 */
export function NoFlashConsentScript() {
  const js = `(function(){var d=document.documentElement,v='0';try{if(/(?:^|;)\\s*consent=/.test(document.cookie)){v='1'}}catch(e){v='0'}d.setAttribute('data-consent',v);})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
