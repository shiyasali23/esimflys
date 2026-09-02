import { SITE } from "@/config/site";

/*
 * Required by `output: "export"`. Next treats the metadata routes as Route Handlers, and
 * a handler with no explicit mode is assumed dynamic — which a static export cannot
 * produce, so the build fails outright rather than shipping the site without this file.
 * Everything read here is committed data, so "force-static" is a statement of fact.
 */
export const dynamic = "force-static";


/**
 * robots.txt (blueprint §28.4). Allow crawling broadly; only disallow no-value
 * paths. IMPORTANT: we do NOT disallow /checkout, /auth, /account — those are
 * kept crawlable + `noindex` (via per-route metadata) so Google can read the
 * noindex. Never disallow JS/CSS.
 */
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /*
        `/search` used to be listed here and no such route has ever existed under src/app —
        a stale rule that only ever confused the next reader.

        `/accounts/` is the allauth surface the Worker proxies to Django. It is linked from
        70 pages (the Google sign-in button) and every one of those links 302s straight to
        accounts.google.com, so there is nothing there to index. On a domain this new the
        crawl budget is small enough that 70 pointers to a redirect are worth not spending.
        Unlike /checkout and /account, this path has no HTML of its own to carry a noindex,
        so robots.txt is the only place it can be expressed.
      */
      disallow: ["/api/", "/accounts/"],
    },
    sitemap: `${SITE.baseUrl}/sitemap.xml`,
  };
}
