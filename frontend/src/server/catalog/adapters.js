import { fromDisplayPrice, fromMinor } from "@/lib/format/units";

/**
 * Translate API payloads into the shape the existing components already consume.
 * Adapting here rather than renaming props across the catalogue UI keeps the
 * migration to one file and leaves component contracts untouched.
 *
 * Two conversions are easy to get wrong and are done only here:
 *   retail_amount_minor (1499) → retail_price_usd (14.99)
 *   data_limit_mb (10000)      → data_gb (10)          [1 GB = 1000 MB]
 */

const MB_PER_GB = 1000;

function gbFromMb(mb) {
  const value = Number(mb);
  return Number.isFinite(value) && value > 0 ? value / MB_PER_GB : null;
}

/**
 * `plan_count` from the API counts ACTIVE plans only, so it maps to livePlanCount —
 * which is what the index gate keys on. The API has no notion of a total-including-
 * paused count, so planCount mirrors it rather than inventing a number.
 *
 * `sortOrder` is the array position: the API returns countries pre-sorted by a
 * curated order but does not expose the field.
 */
export function adaptCountry(raw, index = 0) {
  if (!raw) return null;
  const liveCount = Number(raw.plan_count) || 0;
  return {
    slug: raw.slug,
    iso2: raw.iso2,
    name: raw.name,
    region: raw.region,
    flagEmoji: raw.flag_emoji,
    timezone: raw.timezone ?? null,
    isPopular: Boolean(raw.is_popular),
    homepageBadge: raw.homepage_badge ?? null,
    isActive: true,
    sortOrder: index,
    priceFrom: fromDisplayPrice(raw.price_from),
    planCount: liveCount,
    livePlanCount: liveCount,
    networks: [],
  };
}

export function adaptCountries(list) {
  return (Array.isArray(list) ? list : []).map(adaptCountry).filter(Boolean);
}

/**
 * `daily` plans are the unlimited tier — they carry a per-day high-speed allowance
 * instead of a total, which is exactly what the UI labels "Unlimited".
 */
export function adaptPlan(raw, countrySlug) {
  if (!raw) return null;
  const isUnlimited = raw.plan_type === "daily";
  return {
    product_id: raw.product_code,
    countrySlug,
    plan_type: raw.plan_type,
    display_name: raw.display_name,
    data_gb: gbFromMb(raw.data_limit_mb),
    perDayGb: gbFromMb(raw.daily_high_speed_mb),
    dayCount: raw.day_count ?? null,
    validity_days: Number(raw.validity_days) || 0,
    traffic_policy: raw.traffic_policy ?? null,
    hotspotSupported: raw.hotspot_supported ?? null,
    networkNames: Array.isArray(raw.network_names) ? raw.network_names : [],
    topupSupported: Boolean(raw.topup_supported),
    retail_price_usd: fromMinor(raw.retail_amount_minor),
    currency: raw.currency || "USD",
    pricePerDay: fromDisplayPrice(raw.price_per_day),
    badge: raw.badge ?? null,
    isDefaultSelected: Boolean(raw.is_default_selected),
    sort_order: raw.sort_order ?? 99,
    isUnlimited,
    // The plans endpoint only ever returns active plans.
    status: "active",
    isLive: true,
  };
}

export function adaptPlans(list, countrySlug) {
  return (Array.isArray(list) ? list : [])
    .map((plan) => adaptPlan(plan, countrySlug))
    .filter(Boolean);
}

/**
 * The country serializer carries no networks, but the country page already has the
 * plans, so the distinct union costs no extra request. Order is preserved so the
 * rendered list is stable between builds.
 */
export function withNetworks(country, plans) {
  if (!country) return null;
  const seen = [];
  for (const plan of plans || []) {
    for (const name of plan.networkNames || []) {
      if (name && !seen.includes(name)) seen.push(name);
    }
  }
  return { ...country, networks: seen };
}
