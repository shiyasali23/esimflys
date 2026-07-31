import "server-only";
import catalog from "@/data/catalog.json";
import { FLAGS } from "@/config/flags";
import { fetchCountries, fetchCountryPlans } from "@/lib/api/catalog";
import { adaptCountries, adaptPlans, withNetworks } from "./adapters";

/**
 * The catalogue, read from the live API and rendered on the server so country
 * pages stay statically generated and indexable.
 *
 * `data/catalog.json` survives as an offline fallback only: a build (or CI run)
 * without a reachable backend still produces pages instead of failing, and the
 * fallback announces itself in the log rather than silently serving stale prices.
 * `FLAGS.USE_MOCKS` forces it on for local work without a backend.
 */

const REVALIDATE_SECONDS = 300;

let warned = false;

function fallbackCountries() {
  return catalog.countries
    .filter((c) => c.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function noteFallback(reason) {
  if (warned) return;
  warned = true;
  console.warn(
    `[catalog] live API unavailable (${reason}) — serving data/catalog.json. ` +
      "Prices and availability may be stale.",
  );
}

async function loadCountries() {
  if (FLAGS.USE_MOCKS) return fallbackCountries();
  try {
    return adaptCountries(await fetchCountries({ next: { revalidate: REVALIDATE_SECONDS } }));
  } catch (error) {
    noteFallback(error?.code || error?.message || "unknown");
    return fallbackCountries();
  }
}

function sortPlans(plans) {
  return plans.sort(
    (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || (a.data_gb ?? 0) - (b.data_gb ?? 0),
  );
}

export function getMeta() {
  return catalog.meta;
}

export async function getAllCountries() {
  return loadCountries();
}

export async function getCountrySlugs() {
  return (await loadCountries()).map((c) => c.slug);
}

/** Resolved from the list rather than the detail endpoint — same fields, one request. */
export async function getCountryBySlug(slug) {
  return (await loadCountries()).find((c) => c.slug === slug) || null;
}

export async function getFeaturedCountries(limit = 8) {
  return (await loadCountries()).slice(0, limit);
}

export async function getPopularCountries(limit = 8) {
  return (await loadCountries()).filter((c) => c.isPopular).slice(0, limit);
}

/**
 * The API returns active plans only, so an empty array is the real production
 * state, not an error. With no backend, showPausedPlans keeps the store
 * reviewable in dev by rendering paused rows from the JSON.
 */
export async function getPlansForCountry(slug) {
  if (!FLAGS.USE_MOCKS) {
    try {
      const raw = await fetchCountryPlans(slug, { next: { revalidate: REVALIDATE_SECONDS } });
      return sortPlans(adaptPlans(raw, slug));
    } catch (error) {
      if (error?.status === 404) return [];
      noteFallback(error?.code || error?.message || "unknown");
    }
  }

  const forCountry = catalog.plans.filter((p) => p.countrySlug === slug);
  const active = forCountry.filter((p) => p.status === "active");
  const visible = active.length ? active : FLAGS.showPausedPlans ? forCountry : [];
  return sortPlans(visible.slice());
}

/**
 * The API's `price_from` is already the cheapest per-day rate, so reading it costs
 * no extra request — and avoids an N+1 across the destinations grid.
 */
export async function getPerDayFrom(slug) {
  const country = await getCountryBySlug(slug);
  if (country?.priceFrom != null) return country.priceFrom;

  const rates = (await getPlansForCountry(slug))
    .filter((p) => p.validity_days > 0 && p.retail_price_usd > 0)
    .map((p) => p.retail_price_usd / p.validity_days);
  return rates.length ? Math.min(...rates) : null;
}

/** Country plus the network union derived from its plans — one page, one pair of calls. */
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
  return (await loadCountries())
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c, perDayFrom: c.priceFrom ?? null }));
}

export async function getCountriesByRegion() {
  const byRegion = {};
  for (const c of await loadCountries()) {
    (byRegion[c.region] ||= []).push(c);
  }
  for (const region of Object.keys(byRegion)) {
    byRegion[region].sort((a, b) => a.name.localeCompare(b.name));
  }
  return byRegion;
}
