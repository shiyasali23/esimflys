import { SITE } from "@/config/site";

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
      disallow: ["/api/", "/search"],
    },
    sitemap: `${SITE.baseUrl}/sitemap.xml`,
  };
}
