/**
 * Storefront shapes as the UI actually receives them — i.e. AFTER `adaptCountry`
 * and `adaptPlan`, not the raw API payload. Screens read camelCase here even
 * though the wire format is snake_case, so a fixture in the wire shape would test
 * nothing real.
 *
 * Values traced to the live API on 2026-07-30: Saudi Arabia, 8 active plans.
 */

export const COUNTRY = {
  slug: "saudi-arabia",
  iso2: "SA",
  name: "Saudi Arabia",
  region: "Middle East & N.Africa",
  flagEmoji: "🇸🇦",
  timezone: null,
  isPopular: true,
  homepageBadge: "popular",
  isActive: true,
  sortOrder: 0,
  priceFrom: 0.27,
  planCount: 8,
  livePlanCount: 8,
  networks: ["STC 5G"],
};

export const COUNTRIES = [
  COUNTRY,
  { ...COUNTRY, slug: "thailand", iso2: "TH", name: "Thailand", flagEmoji: "🇹🇭",
    region: "Asia Pacific", priceFrom: 0.31, homepageBadge: null, sortOrder: 1 },
  { ...COUNTRY, slug: "united-arab-emirates", iso2: "AE", name: "United Arab Emirates",
    flagEmoji: "🇦🇪", priceFrom: 0.45, homepageBadge: null, sortOrder: 2 },
  // A country with no active plans: `priceFrom` is null, so "from $X/day" must not render.
  { ...COUNTRY, slug: "iceland", iso2: "IS", name: "Iceland", flagEmoji: "🇮🇸",
    region: "Europe", priceFrom: null, planCount: 0, livePlanCount: 0,
    isPopular: false, homepageBadge: null, sortOrder: 3 },
];

/** A fixed plan: one total allowance over a validity window. */
export const PLAN = {
  product_id: "SA-10GB-30D-V1",
  countrySlug: "saudi-arabia",
  plan_type: "fixed",
  display_name: "Saudi Arabia 10 GB — 30 Days",
  data_gb: 10,
  perDayGb: null,
  dayCount: null,
  validity_days: 30,
  traffic_policy: null,
  hotspotSupported: null,
  networkNames: ["STC 5G"],
  topupSupported: true,
  retail_price_usd: 16.99,
  currency: "USD",
  pricePerDay: 0.57,
  badge: "popular",
  isDefaultSelected: true,
  sort_order: 1,
  isUnlimited: false,
  status: "active",
  isLive: true,
};

/** A `daily` plan is the unlimited tier — a per-day allowance, no total. */
export const UNLIMITED_PLAN = {
  ...PLAN,
  product_id: "SA-UL-7D-V1",
  plan_type: "daily",
  display_name: "Saudi Arabia Unlimited — 7 Days",
  data_gb: null,
  perDayGb: 2,
  dayCount: 7,
  validity_days: 7,
  retail_price_usd: 12.99,
  pricePerDay: 1.86,
  badge: null,
  isDefaultSelected: false,
  sort_order: 2,
  isUnlimited: true,
};

export const PLANS = [PLAN, UNLIMITED_PLAN];

export const ORDER = {
  id: "ord-1",
  order_number: "ESF-79039D08EF7C",
  customer_email: "traveller@example.com",
  currency: "USD",
  subtotal_minor: 1699,
  discount_minor: 0,
  tax_minor: 0,
  total_minor: 1699,
  status: "fulfilled",
  payment_status: "paid",
  fulfillment_status: "delivered",
  placed_at: "2026-07-30T10:00:00Z",
  created_at: "2026-07-30T10:00:00Z",
  promo_code_snapshot: null,
  item_count: 1,
};

/** eSIM usage is in BYTES; a plan's allowance is in MB. Different units, deliberately. */
export const ESIM = {
  id: "esim-1",
  status: "active",
  order_number: ORDER.order_number,
  product_name: PLAN.display_name,
  country_iso2: "SA",
  iccid_last4: "5587",
  total_data_bytes: 10000000000,
  remaining_data_bytes: 4200000000,
  installed_at: "2026-07-30T11:00:00Z",
  activated_at: "2026-07-30T11:05:00Z",
  expires_at: "2026-08-29T11:05:00Z",
  last_synced_at: "2026-07-30T12:00:00Z",
  created_at: "2026-07-30T10:01:00Z",
};

export const page = (results) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});
