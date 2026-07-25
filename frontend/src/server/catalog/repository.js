import "server-only";
import catalog from "@/data/catalog.json";
import { FLAGS } from "@/config/flags";

const ACTIVE_COUNTRIES = catalog.countries
  .filter((c) => c.isActive)
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder);
const PLANS = catalog.plans;

export function getMeta() {
  return catalog.meta;
}

export function getAllCountries() {
  return ACTIVE_COUNTRIES;
}

export function getCountrySlugs() {
  return ACTIVE_COUNTRIES.map((c) => c.slug);
}

export function getCountryBySlug(slug) {
  return ACTIVE_COUNTRIES.find((c) => c.slug === slug) || null;
}

export function getFeaturedCountries(limit = 8) {
  return ACTIVE_COUNTRIES.slice(0, limit);
}

export function getPopularCountries(limit = 8) {
  return ACTIVE_COUNTRIES.filter((c) => c.isPopular).slice(0, limit);
}

/**
 * Plans to show for a country. Production shows only status==='active'.
 * Safe fallback: with zero active plans AND showPausedPlans on (dev/preview),
 * render paused rows so the store is never unexpectedly empty; with the flag off
 * (production) an empty result is returned and the UI shows an empty state.
 */
export function getPlansForCountry(slug) {
  const forCountry = PLANS.filter((p) => p.countrySlug === slug);
  const active = forCountry.filter((p) => p.status === "active");
  const visible = active.length ? active : FLAGS.showPausedPlans ? forCountry : [];
  return visible
    .slice()
    .sort(
      (a, b) =>
        (a.sort_order ?? 99) - (b.sort_order ?? 99) ||
        (a.data_gb ?? 0) - (b.data_gb ?? 0),
    );
}

/** Lowest per-day price (retail / validity) across the plans actually shown. */
export function getPerDayFrom(slug) {
  const rates = getPlansForCountry(slug)
    .filter((p) => p.validity_days > 0 && p.retail_price_usd > 0)
    .map((p) => p.retail_price_usd / p.validity_days);
  return rates.length ? Math.min(...rates) : null;
}

export function getHomeDestinations(limit = 8) {
  return getFeaturedCountries(limit).map((c) => ({ ...c, perDayFrom: getPerDayFrom(c.slug) }));
}

export function getAllDestinations() {
  return ACTIVE_COUNTRIES.slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c, perDayFrom: getPerDayFrom(c.slug) }));
}

export function getCountriesByRegion() {
  const byRegion = {};
  for (const c of ACTIVE_COUNTRIES) {
    (byRegion[c.region] ||= []).push(c);
  }
  for (const region of Object.keys(byRegion)) {
    byRegion[region].sort((a, b) => a.name.localeCompare(b.name));
  }
  return byRegion;
}
