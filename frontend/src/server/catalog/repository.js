import "server-only";
import catalog from "@/data/catalog.json";
import { withNetworks } from "./adapters";
import { withDisplayNetworks, withDisplayNetworkNames } from "@/lib/catalog/network-aliases";
import { RELATED_SLUGS } from "@/config/related";
import { FEATURED_SLUGS } from "@/config/featured";

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
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map(withDisplayNetworks);

const PLANS_BY_SLUG = catalog.plans.reduce((acc, plan) => {
  (acc[plan.countrySlug] ||= []).push(withDisplayNetworkNames(plan));
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

/**
 * The curated home-page line-up, in `FEATURED_SLUGS` order.
 *
 * This used to be `COUNTRIES.slice(0, limit)` — the first N by `sortOrder`, which meant the
 * shop's shop window was decided by a spreadsheet column and ignored `isPopular` entirely.
 *
 * Unknown or deactivated slugs are dropped rather than rendered as holes, and if the list
 * somehow resolves to nothing the `isPopular` countries stand in, so the home page can
 * never come back empty because of a typo in a config file.
 */
export async function getFeaturedCountries(limit = 8) {
  const bySlug = new Map(COUNTRIES.map((c) => [c.slug, c]));
  const curated = FEATURED_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean);
  const chosen = curated.length ? curated : COUNTRIES.filter((c) => c.isPopular);
  return chosen.slice(0, limit);
}

export async function getPopularCountries(limit = 8) {
  return COUNTRIES.filter((c) => c.isPopular).slice(0, limit);
}

/**
 * Countries to suggest at the foot of a country page, nearest-region first.
 *
 * This replaced `getPopularCountries(7)`, and the reason is a crawl problem rather than a
 * merchandising one. That call returns the first seven `isPopular` entries by `sortOrder`,
 * and `sortOrder` 0-6 are all inside the ten editorially approved countries — so every one
 * of the 68 country pages linked to the same six approved destinations. The internal link
 * graph was a closed loop: the only pages Google had indexed pointed exclusively at each
 * other, and there was no route from an indexed page to any of the 58 `noindex` ones except
 * `/destinations`, which Google had not crawled.
 *
 * Region-first fixes that as a side effect of being genuinely more useful. Someone reading
 * the Thailand page is far likelier to also want Vietnam or Cambodia than Morocco, and
 * those neighbours are exactly the unapproved pages that needed a way in.
 *
 * Suggestions are NOT filtered by index status. A `noindex` country page is live, buyable
 * and crawlable — `noindex, follow` — so linking to it is honest for a shopper and is the
 * whole point for a crawler. Approval controls whether a page may be INDEXED, not whether
 * it may be linked.
 *
 * Falls back to filling from other regions so a country in a thin region still shows a full
 * row rather than one lonely neighbour.
 */
export async function getRelatedCountries(slug, limit = 6) {
  const current = await getCountryBySlug(slug);
  if (!current) return [];

  const bySlug = new Map(COUNTRIES.map((c) => [c.slug, c]));
  const curated = (RELATED_SLUGS[slug] || []).map((s) => bySlug.get(s)).filter(Boolean);

  const others = COUNTRIES.filter((c) => c.slug !== slug && !curated.includes(c));
  const sameRegion = others.filter((c) => c.region === current.region);
  const elsewhere = others.filter((c) => c.region !== current.region && c.isPopular);
  const regionAll = COUNTRIES.filter((c) => c.region === current.region);
  const pos = Math.max(0, regionAll.findIndex((c) => c.slug === slug));
  const rotated = sameRegion.length
    ? [...sameRegion.slice(pos % sameRegion.length), ...sameRegion.slice(0, pos % sameRegion.length)]
    : [];

  return [...curated, ...rotated, ...elsewhere].slice(0, limit);
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
