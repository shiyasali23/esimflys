import { describe, it, expect } from "vitest";
import { adaptCountries, adaptCountry, adaptPlan, adaptPlans, withNetworks } from "@/server/catalog/adapters";

const RAW_COUNTRY = {
  iso2: "SA",
  name: "Saudi Arabia",
  slug: "saudi-arabia",
  region: "Middle East & N.Africa",
  flag_emoji: "🇸🇦",
  timezone: null,
  is_popular: true,
  homepage_badge: "popular",
  price_from: { amount: "0.27", currency: "USD" },
  plan_count: 8,
};

const RAW_FIXED = {
  product_code: "SA-10GB-30D-V1",
  plan_type: "fixed",
  display_name: "Saudi Arabia 10 GB — 30 Days",
  data_limit_mb: 10000,
  daily_high_speed_mb: null,
  day_count: null,
  validity_days: 30,
  network_names: ["STC 5G"],
  retail_amount_minor: 1499,
  currency: "USD",
  price_per_day: { amount: "0.50", currency: "USD" },
  badge: "popular",
  is_default_selected: true,
  sort_order: 1,
  hotspot_supported: null,
  topup_supported: true,
};

const RAW_DAILY = {
  ...RAW_FIXED,
  product_code: "SA-UNL-3D-V1",
  plan_type: "daily",
  data_limit_mb: null,
  daily_high_speed_mb: 1000,
  day_count: 3,
  validity_days: 3,
  retail_amount_minor: 899,
  badge: null,
  is_default_selected: false,
  sort_order: 6,
};

describe("adaptCountry", () => {
  it("renames API fields onto the shape the UI consumes", () => {
    const c = adaptCountry(RAW_COUNTRY, 0);
    expect(c.flagEmoji).toBe("🇸🇦");
    expect(c.homepageBadge).toBe("popular");
    expect(c.isPopular).toBe(true);
  });

  // price_from is a pre-formatted decimal string, NOT minor units.
  it("reads price_from as a decimal, not cents", () => {
    expect(adaptCountry(RAW_COUNTRY).priceFrom).toBe(0.27);
  });

  it("yields a null price for a country with no active plans", () => {
    expect(adaptCountry({ ...RAW_COUNTRY, price_from: null, plan_count: 0 }).priceFrom).toBeNull();
  });

  // The API's plan_count is ACTIVE-only, which is what the index gate keys on.
  it("maps plan_count to livePlanCount", () => {
    const c = adaptCountry({ ...RAW_COUNTRY, plan_count: 0 });
    expect(c.livePlanCount).toBe(0);
    expect(c.planCount).toBe(0);
  });

  it("derives sortOrder from array position, since the API omits the field", () => {
    const list = adaptCountries([RAW_COUNTRY, { ...RAW_COUNTRY, slug: "thailand" }]);
    expect(list.map((c) => c.sortOrder)).toEqual([0, 1]);
  });
});

describe("adaptPlan", () => {
  it("converts minor units to a decimal price", () => {
    expect(adaptPlan(RAW_FIXED, "saudi-arabia").retail_price_usd).toBe(14.99);
  });

  it("converts MB to GB at 1000, not 1024", () => {
    expect(adaptPlan(RAW_FIXED, "saudi-arabia").data_gb).toBe(10);
  });

  it("reads the per-day allowance for daily plans and marks them unlimited", () => {
    const plan = adaptPlan(RAW_DAILY, "saudi-arabia");
    expect(plan.perDayGb).toBe(1);
    expect(plan.data_gb).toBeNull();
    expect(plan.isUnlimited).toBe(true);
    expect(plan.dayCount).toBe(3);
  });

  it("does not mark fixed plans unlimited", () => {
    expect(adaptPlan(RAW_FIXED, "saudi-arabia").isUnlimited).toBe(false);
  });

  // null means "unknown", and must never be coerced into a false "no".
  it("preserves unknown hotspot support as null", () => {
    expect(adaptPlan(RAW_FIXED, "saudi-arabia").hotspotSupported).toBeNull();
  });

  it("carries the country slug so plans can be grouped", () => {
    expect(adaptPlans([RAW_FIXED], "saudi-arabia")[0].countrySlug).toBe("saudi-arabia");
  });
});

describe("withNetworks", () => {
  // The country serializer has no networks; they are unioned from its plans.
  it("collects distinct network names in first-seen order", () => {
    const plans = [
      { networkNames: ["STC 5G", "Zain"] },
      { networkNames: ["Zain", "Mobily"] },
    ];
    expect(withNetworks(adaptCountry(RAW_COUNTRY), plans).networks).toEqual([
      "STC 5G",
      "Zain",
      "Mobily",
    ]);
  });

  it("returns an empty list rather than failing when no plans are shown", () => {
    expect(withNetworks(adaptCountry(RAW_COUNTRY), []).networks).toEqual([]);
  });
});
