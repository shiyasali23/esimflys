import { SITE } from "@/config/site";

/*
 * Required by `output: "export"`. Next treats the metadata routes as Route Handlers, and
 * a handler with no explicit mode is assumed dynamic — which a static export cannot
 * produce, so the build fails outright rather than shipping the site without this file.
 * Everything read here is committed data, so "force-static" is a statement of fact.
 */
export const dynamic = "force-static";


export default function manifest() {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#615de5",
    lang: "en",
    dir: "ltr",
    categories: ["travel", "shopping", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
