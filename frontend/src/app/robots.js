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
      // `/search` used to be listed here and no such route has ever existed under
      // src/app — a stale rule that only ever confused the next reader.
      disallow: ["/api/"],
    },
    sitemap: `${SITE.baseUrl}/sitemap.xml`,
  };
}
