/**
 * The entire server side of esimflys.com.
 *
 * It replaces `@opennextjs/cloudflare`, whose `handler.mjs` was 6.27 MB of Next.js
 * server runtime imported on every cold isolate — measured at 316-544 ms CPU against
 * Cloudflare's startup budget, which is what returned `Error 1102 — Worker exceeded
 * resource limits` to real visitors.
 *
 * What this Worker does NOT do is the important part. Cloudflare's asset router runs
 * before it and answers anything that matches a file in `out/` directly, so a page
 * view, a JS chunk and a flag SVG never reach this code at all. This runs only for
 * paths with no matching asset: the two proxied API prefixes, and genuine 404s.
 *
 * Consequences worth knowing before editing:
 *
 *   - Adding a route here does not make it faster than a static file; it makes it
 *     slower, because it opts that path out of the free asset path.
 *   - `_headers` and `_redirects` in `out/` are applied by the asset router, not here.
 *     Headers set in this file cover ONLY the responses this file produces.
 */

/**
 * Same-origin proxy. The backend authenticates with HttpOnly SameSite=Lax session
 * cookies, so a cross-origin fetch from the browser to the Railway host would silently
 * drop them on every request. Serving the API under our own origin keeps the cookie
 * same-site and makes CORS irrelevant.
 *
 * `/accounts/` is the allauth surface and carries the Google OAuth redirect flow.
 */
const PROXIED_PREFIXES = ["/api/v1/", "/accounts/"];

/**
 * Legacy URL canonicalisation (blueprint §28.3), deliberately handled HERE rather than in
 * a `public/_redirects` file.
 *
 * `_redirects` is evaluated BEFORE asset matching, so a rule with a `:slug` placeholder
 * matches anything in that directory — including Next's own route-payload files. That is
 * not hypothetical: `/destinations/:slug -> /esim/:slug` was 308ing all seven
 * `out/destinations/__next.*` files to `/esim/...` paths that do not exist, so every one
 * 404'd and the App Router lost its prefetch for the main browse page. Measured cost of
 * that on mobile / Slow 4G: a 1273 ms transition where an unaffected route took 95 ms.
 *
 * This Worker runs only when the asset router has already failed to match, so a redirect
 * expressed here CANNOT shadow a real file. That is the whole reason for moving them.
 *
 * The first attempted fix was a `200` passthrough rule in `_redirects`. It worked under
 * `wrangler dev --local` and was silently ignored in production — proxy-status rules are a
 * Pages feature, not a Workers Static Assets one. Both environments were checked against
 * the same `out/`; production kept 308ing. Do not reach for that again.
 *
 * 308, not 301: 301 lets an agent downgrade a POST to GET on replay, and 308 is what
 * `permanent: true` emitted before the static-export migration, so no already-indexed URL
 * changes meaning.
 */
function legacyRedirect(url) {
  const { pathname } = url;

  if (pathname === "/plans" || pathname === "/plans/") {
    return new URL("/destinations", url.origin);
  }

  const slugged = /^\/(?:plans|destinations)\/([^/]+)\/?$/.exec(pathname);
  if (slugged) {
    return new URL(`/esim/${slugged[1]}`, url.origin);
  }

  return null;
}

const handler = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (PROXIED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return proxyToBackend(request, url, env);
    }

    const target = legacyRedirect(url);
    if (target) {
      target.search = url.search;
      return Response.redirect(target.toString(), 308);
    }

    return notFound(url, env);
  },
};

export default handler;

async function proxyToBackend(request, url, env) {
  const origin = (env.BACKEND_ORIGIN || "").replace(/\/$/, "");
  if (!origin) {
    // Loud, not silent. An unset var here means every authenticated request fails while
    // every page still renders perfectly — the failure mode that is hardest to notice.
    return new Response("BACKEND_ORIGIN is not configured on this Worker.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const target = new URL(origin);
  /*
   * Exactly one trailing slash, always. Django's APPEND_SLASH answers a slash-less URL
   * with a 301, and a 301 replayed by the browser downgrades an authenticated POST to a
   * GET — the request succeeds, the write never happens. Normalising here means Django
   * never has to redirect, so that path is unreachable rather than merely unlikely.
   */
  target.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  target.search = url.search;

  /*
   * `new Request(target, request)` streams the body through untouched. That is required,
   * not incidental: the Stripe webhook posts to /api/v1/webhooks/stripe/ and its
   * signature is computed over the raw bytes. Parsing and re-serialising the body would
   * make every webhook fail signature verification — i.e. paid orders never provision.
   */
  const outbound = new Request(target, request);
  outbound.headers.set("X-Forwarded-Host", url.host);
  outbound.headers.set("X-Forwarded-Proto", "https");

  const response = await fetch(outbound, {
    /*
     * Pass redirects to the browser instead of following them here. The Google sign-in
     * flow is a 302 to accounts.google.com; followed server-side, the Worker would fetch
     * Google's consent page and hand the user its HTML on our origin, and sign-in would
     * simply never start.
     */
    redirect: "manual",
    /*
     * No `cf` cache options here, deliberately.
     *
     * `cf: { cacheTtl: 0 }` looks like "do not cache" and is the opposite: cacheTtl
     * FORCES the response through Cloudflare's cache regardless of its headers, and a
     * cached response has its `Set-Cookie` stripped. Measured in production — the
     * origin returned `set-cookie: csrftoken=…` and the browser received a 200 with
     * `cf-cache-status: EXPIRED`, no cookie, and an invented `cache-control:
     * max-age=14400`. With no CSRF cookie every POST, PUT and DELETE fails.
     *
     * Left alone, Cache Level Standard applies: it caches by file extension, and no API
     * path has one, so nothing here is cached. That also keeps one signed-in customer's
     * cart from being served to another — Cloudflare ignores the `Vary: Cookie` the
     * backend sends, so the cache could not tell them apart if it ever did store them.
     */
  });

  // Headers on a Response from fetch() are immutable; clone to add our own.
  const proxied = new Response(response.body, response);
  proxied.headers.set("X-Content-Type-Options", "nosniff");
  return proxied;
}

/**
 * The asset router only reaches this Worker when nothing in `out/` matched, so by the
 * time we are here the request is a real 404. `not_found_handling` is deliberately left
 * off in wrangler.jsonc: switching it on would make the asset router answer unmatched
 * paths itself, and the API prefixes above — which match no asset either — would get the
 * 404 page instead of the backend.
 */
async function notFound(url, env) {
  const page = await env.ASSETS.fetch(new URL("/404.html", url.origin));
  return new Response(page.body, {
    status: 404,
    headers: {
      "content-type": page.headers.get("content-type") || "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "frame-ancestors 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
