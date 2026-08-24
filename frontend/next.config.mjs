/**
 * The production build is a STATIC EXPORT (`output: "export"`), served from Cloudflare
 * Workers Static Assets with a ~40-line proxy Worker in front (`worker/index.js`).
 *
 * This replaced `@opennextjs/cloudflare`. That adapter shipped a 6.27 MB `handler.mjs`
 * containing the Next.js server runtime, imported at the top of every cold isolate.
 * Measured: 316-544 ms CPU on a cold isolate against Cloudflare's startup budget, which
 * is what produced `Error 1102 — Worker exceeded resource limits` on esimflys.com. The
 * export has no server runtime to evaluate, and a page request now never invokes a
 * Worker at all: the asset router answers it directly.
 *
 * Three config sections had to move out, because a static export has no server to run
 * them in. They are NOT dropped — each has a live equivalent:
 *
 *   rewrites()  -> the proxy Worker (`/api/v1/*`, `/accounts/*`). Kept below for `next dev`.
 *   redirects() -> `worker/index.js` (legacyRedirect)
 *   headers()   -> `public/_headers`
 *
 * Change one of those and you must change its counterpart, or dev and production drift.
 */

/**
 * `localhost`, not `127.0.0.1` — the host here is load-bearing, not cosmetic.
 *
 * The dev rewrite forwards this as the `Host` header, and allauth builds the Google
 * `redirect_uri` from it. With `127.0.0.1` the callback lands on a different host
 * than the browser session (which lives on `localhost:3000`), so the session cookie
 * Django sets during the callback is scoped to `127.0.0.1` and never reaches the
 * frontend: sign-in appears to succeed while the app still sees a signed-out user.
 */
const DEV_BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || "http://localhost:8000").replace(/\/$/, "");

/**
 * The production build no longer reads `BACKEND_ORIGIN`. Under OpenNext it was baked
 * into the rewrite destinations at build time, so a wrong value could only be fixed by
 * rebuilding. It is now a Worker var (`wrangler.jsonc`), read at request time, which
 * means the backend can move without touching the frontend build at all.
 */
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Next strips trailing slashes by default (308); Django REST adds them back (301).
   * Left alone the two normalisations bounce a proxied API call between :3000 and
   * :8000 forever in dev. Our own pages are all slash-less, so nothing else depends
   * on it. In production Cloudflare's asset router does this normalisation instead
   * (`html_handling: "auto-trailing-slash"`), and it never sees API paths because no
   * asset matches them.
   */
  skipTrailingSlashRedirect: true,

  /**
   * Inline the stylesheet into each prerendered page instead of linking it.
   *
   * The stylesheet is small — 13 KB on the wire — but it was the last thing standing
   * between the visitor and first paint, and not because of its size.
   *
   * [MEASURED] /esim/turkey, mobile, Slow 4G, cold cache. Every one of the 16
   * subresources starts at the same instant (737 ms) when the preload scanner fires,
   * and then fair-shares the link:
   *
   *     bytes in flight before FCP:  JS 201 KB, fonts 92 KB, CSS 13 KB, images 6 KB
   *     CSS request:                 737 ms -> 2244 ms   (1507 ms for 13 KB)
   *     FCP:                         2320 ms, immediately after the CSS lands
   *
   * 13 KB is ~65 ms of transfer on this link. It took 1507 ms because it was queued
   * against 24x its own weight of scripts and fonts, none of which first paint needs —
   * the scripts are hydration-only and the fonts are `display: swap`, so text paints in
   * the metric-matched fallback regardless. Chrome does not starve those to feed the
   * render-blocking stylesheet; they all progress together and the small ones land first.
   *
   * Inlining removes the round trip and the contention in one move: the styles arrive
   * inside the HTML, so paint no longer waits on the network at all.
   *
   * [MEASURED] A/B on the same machine, same server, same Slow 4G profile, each in a
   * fresh isolated browser context so neither run saw a warm cache:
   *
   *     inlineCss off   HTML 18 KB gz   CSS 12 KB, 580 -> 1504 ms   FCP/LCP 1572 ms
   *     inlineCss on    HTML 55 KB gz   no CSS request              FCP/LCP  800 ms
   *
   * 772 ms, or 49%. Run-to-run spread on this setup was measured at 34%, so the effect is
   * well outside the noise. Paint now happens BEFORE the document finishes arriving
   * (FCP 800 ms vs responseEnd 877 ms) because the styles stream in with the markup.
   *
   * THE COST, measured rather than assumed, because it is bigger than it looks:
   *
   *   - Next inlines the stylesheet TWICE — once as a <style> block and again inside the
   *     RSC flight payload, so the HTML grows by more than the stylesheet's own weight
   *     (18 -> 55 KB gz, not 18 -> 31).
   *   - `__next._index.txt`, which the App Router fetches on every prefetch and every
   *     client navigation, carries the CSS too: 3.3 KB gz -> 15.4 KB gz per route.
   *     The other segment payloads are unchanged.
   *
   * So this buys 772 ms on every cold load and spends ~12 KB gz per route the visitor
   * prefetches or navigates to. Taken deliberately: the cold load is what Googlebot and
   * every first-time visitor measures, and a static export has exactly ONE shared
   * stylesheet so there is no per-route CSS to duplicate.
   *
   * It does sharpen the open question in the audit's F-4 — the home page prefetches four
   * country pages, which now costs ~48 KB gz instead of ~13 KB. If prefetch volume is
   * ever tuned down, re-measure this trade rather than assuming it still holds.
   */
  experimental: {
    inlineCss: true,
  },

  ...(IS_PRODUCTION_BUILD
    ? {
        output: "export",
        images: {
          /*
           * Required by `output: "export"`: the default loader calls `/_next/image`,
           * which is a server route that no longer exists. Every image this app
           * renders is a local asset already sized in the markup, so there is nothing
           * for an optimizer to do that the build has not done — and routing them
           * through Cloudflare Images would be a paid product for zero gain here.
           */
          unoptimized: true,
        },
      }
    : {
        /**
         * Dev only. The backend authenticates with HttpOnly SameSite=Lax session
         * cookies, so a cross-origin fetch from :3000 to :8000 would silently drop
         * them. Routing the API under our own origin keeps the cookie same-site and
         * makes CORS irrelevant. `/accounts/` carries the allauth (Google) redirect
         * flow. In production the proxy Worker does exactly this, same two prefixes.
         *
         * Two rules per prefix, slash-terminated first, because Node and workerd
         * disagreed about what `:path*` captures from a path that already ends in a
         * slash. That divergence is gone now that production does not use rewrites at
         * all, but the pair is harmless and keeps dev matching production's behaviour:
         * exactly one trailing slash reaches Django either way.
         */
        async rewrites() {
          return [
            { source: "/api/v1/:path*/", destination: `${DEV_BACKEND_ORIGIN}/api/v1/:path*/` },
            { source: "/api/v1/:path*", destination: `${DEV_BACKEND_ORIGIN}/api/v1/:path*/` },
            { source: "/accounts/:path*/", destination: `${DEV_BACKEND_ORIGIN}/accounts/:path*/` },
            { source: "/accounts/:path*", destination: `${DEV_BACKEND_ORIGIN}/accounts/:path*/` },
          ];
        },
        /**
         * Dev mirror of `legacyRedirect()` in worker/index.js (blueprint §28.3). The
         * Worker serves these in production; without them here, `/plans` 404s in dev
         * only, which is the kind of divergence that gets "fixed" by deleting the
         * production rule. Change both together.
         */
        async redirects() {
          return [
            { source: "/auth", destination: "/auth/signin", permanent: true },
            { source: "/plans", destination: "/destinations", permanent: true },
            { source: "/plans/:slug", destination: "/esim/:slug", permanent: true },
            { source: "/destinations/:slug", destination: "/esim/:slug", permanent: true },
          ];
        },
        images: { formats: ["image/avif", "image/webp"], remotePatterns: [] },
      }),
};

export default nextConfig;
