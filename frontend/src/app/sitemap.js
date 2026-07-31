import { SITE } from "@/config/site";
import { getAllCountries } from "@/server/catalog/repository";
import { isCountryIndexable } from "@/config/indexing";
import help from "@/content/help.json";

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
