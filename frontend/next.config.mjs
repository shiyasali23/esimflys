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
 *   redirects() -> `public/_redirects`
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
         * Dev mirror of `public/_redirects` (blueprint §28.3). Cloudflare serves these
         * in production; without them here, `/plans` 404s in dev only, which is the
         * kind of divergence that gets "fixed" by deleting the production rule.
         */
        async redirects() {
          return [
            { source: "/plans", destination: "/destinations", permanent: true },
            { source: "/plans/:slug", destination: "/esim/:slug", permanent: true },
            { source: "/destinations/:slug", destination: "/esim/:slug", permanent: true },
          ];
        },
        images: { formats: ["image/avif", "image/webp"], remotePatterns: [] },
      }),
};

export default nextConfig;
