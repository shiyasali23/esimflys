import { describe, it, expect } from "vitest";
import { toClientPlan } from "@/features/catalog/lib/to-client-plan";

describe("toClientPlan", () => {
  it("keeps client-safe fields and strips server-only fields", () => {
    const raw = {
      product_id: "JP-10GB-30D",
      data_gb: 10,
      validity_days: 30,
      retail_price_usd: 18.99,
      isUnlimited: false,
      wholesale_price_usd: 9.5,
      competitor_ref_price: 21.0,
      competitor_ref_brand: "OtherCo",
      supplier_package_code: "SUP123",
      wsp_verified_date: "2026-01-01",
    };

    const safe = toClientPlan(raw);

    expect(safe.product_id).toBe("JP-10GB-30D");
    expect(safe.retail_price_usd).toBe(18.99);
    expect(safe.data_gb).toBe(10);
    expect(safe.wholesale_price_usd).toBeUndefined();
    expect(safe.competitor_ref_price).toBeUndefined();
    expect(safe.competitor_ref_brand).toBeUndefined();
    expect(safe.supplier_package_code).toBeUndefined();
    expect(safe.wsp_verified_date).toBeUndefined();
  });
});
