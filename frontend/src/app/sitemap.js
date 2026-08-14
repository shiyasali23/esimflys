import { SITE } from "@/config/site";
import { getAllCountries } from "@/server/catalog/repository";
import { isCountryIndexable } from "@/config/indexing";
import help from "@/content/help.json";

/*
 * Required by `output: "export"`. Next treats the metadata routes as Route Handlers, and
 * a handler with no explicit mode is assumed dynamic — which a static export cannot
 * produce, so the build fails outright rather than shipping the site without this file.
 * Everything read here is committed data, so "force-static" is a statement of fact.
 */
export const dynamic = "force-static";


export default async function sitemap() {
  const base = SITE.baseUrl.replace(/\/$/, "");

  const staticPaths = [
    "/",
    "/destinations",
    "/supported-devices",
    "/what-is-esim",
    "/how-it-works",
    "/about",
    "/for-business",
    "/affiliates",
    "/contact",
    "/help",
    "/glossary",
  ];
  const helpPaths = help.categories.map((c) => `/help/${c.slug}`);

  const staticEntries = [...staticPaths, ...helpPaths].map((p) => ({
    url: `${base}${p === "/" ? "" : p}` || base,
  }));

  const countryEntries = (await getAllCountries())
    .filter(isCountryIndexable)
    .map((c) => ({ url: `${base}/esim/${c.slug}` }));

  return [...staticEntries, ...countryEntries];
}
