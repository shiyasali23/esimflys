import "server-only";
import catalog from "@/data/catalog.json";
import { withNetworks } from "./adapters";

/**
 * The catalogue, read from `src/data/catalog.json` — baked at build time by
 * `scripts/generate-catalog.mjs`, which pulls it from the live API.
 *
 * There is deliberately NO runtime API call here. Country pages are fully static:
 * no per-request fetch, nothing to time out, and the storefront keeps serving even
 * when the backend is down — which has already happened once, when a connection
 * leak took the API out and the build fell back mid-run.
 *
 * The cost is staleness. Prices and availability are as fresh as the last build,
 * so **rebuild whenever the catalogue changes.** Money is still safe either way:
 * checkout re-reads live prices server-side and returns 409 `plan_unavailable` for
 * a plan paused since the build, which the plan selector surfaces as "refresh to
 * see current plans". A customer can be surprised; they cannot be mischarged.
 *
 * The generator writes ALREADY-ADAPTED objects, so nothing is transformed here.
 */

const COUNTRIES = catalog.countries
  .filter((c) => c.isActive)
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder);

const PLANS_BY_SLUG = catalog.plans.reduce((acc, plan) => {
  (acc[plan.countrySlug] ||= []).push(plan);
  return acc;
}, {});

for (const slug of Object.keys(PLANS_BY_SLUG)) {
  PLANS_BY_SLUG[slug].sort(
    (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || (a.data_gb ?? 0) - (b.data_gb ?? 0),
  );
}

export function getMeta() {
  return catalog.meta;
}

export async function getAllCountries() {
  return COUNTRIES;
}

export async function getCountrySlugs() {
  return COUNTRIES.map((c) => c.slug);
}

export async function getCountryBySlug(slug) {
  return COUNTRIES.find((c) => c.slug === slug) || null;
}

export async function getFeaturedCountries(limit = 8) {
  return COUNTRIES.slice(0, limit);
}

export async function getPopularCountries(limit = 8) {
  return COUNTRIES.filter((c) => c.isPopular).slice(0, limit);
}

/**
 * The generator only ever writes active plans, because the public API only returns
 * active ones. An empty array is therefore the real production state for a country
 * whose plans are paused — not an error, and not something to paper over.
 */
export async function getPlansForCountry(slug) {
  return PLANS_BY_SLUG[slug] || [];
}

/** `priceFrom` is already the cheapest per-day rate, so no plan scan is needed. */
export async function getPerDayFrom(slug) {
  const country = await getCountryBySlug(slug);
  if (country?.priceFrom != null) return country.priceFrom;

  const rates = (await getPlansForCountry(slug))
    .filter((p) => p.validity_days > 0 && p.retail_price_usd > 0)
    .map((p) => p.retail_price_usd / p.validity_days);
  return rates.length ? Math.min(...rates) : null;
}

/** Country plus the network union derived from its plans. */
export async function getCountryWithNetworks(slug) {
  const country = await getCountryBySlug(slug);
  if (!country) return { country: null, plans: [] };
  const plans = await getPlansForCountry(slug);
  return { country: withNetworks(country, plans), plans };
}

export async function getHomeDestinations(limit = 8) {
  return (await getFeaturedCountries(limit)).map((c) => ({ ...c, perDayFrom: c.priceFrom ?? null }));
}

export async function getAllDestinations() {
  return COUNTRIES.slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c, perDayFrom: c.priceFrom ?? null }));
}

export async function getCountriesByRegion() {
  const byRegion = {};
  for (const c of COUNTRIES) {
    (byRegion[c.region] ||= []).push(c);
  }
  for (const region of Object.keys(byRegion)) {
    byRegion[region].sort((a, b) => a.name.localeCompare(b.name));
  }
  return byRegion;
}
