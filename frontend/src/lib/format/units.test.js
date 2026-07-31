import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatDataMb,
  fromDisplayPrice,
  fromMinor,
  planAllowance,
  toMinor,
  usageRatio,
} from "@/lib/format/units";

describe("minor units", () => {
  it("converts payable integers to decimal amounts", () => {
    expect(fromMinor(1699)).toBe(16.99);
    expect(fromMinor(3398)).toBe(33.98);
    expect(fromMinor(0)).toBe(0);
  });

  it("round-trips without float drift", () => {
    expect(toMinor(16.99)).toBe(1699);
    expect(toMinor(fromMinor(2499))).toBe(2499);
  });

  it("degrades to 0 rather than NaN on bad input", () => {
    expect(fromMinor(null)).toBe(0);
    expect(fromMinor(undefined)).toBe(0);
    expect(toMinor("abc")).toBe(0);
  });
});

describe("fromDisplayPrice", () => {
  // price_from / price_per_day are pre-formatted decimal strings, NOT minor units.
  it("reads the decimal string as-is", () => {
    expect(fromDisplayPrice({ amount: "0.57", currency: "USD" })).toBe(0.57);
    expect(fromDisplayPrice({ amount: "0.27", currency: "USD" })).toBe(0.27);
  });

  it("returns null when a country has no active plans", () => {
    expect(fromDisplayPrice(null)).toBeNull();
    expect(fromDisplayPrice({})).toBeNull();
  });
});

describe("data allowances (MB) vs usage (bytes)", () => {
  it("formats MB allowances with 1 GB = 1000 MB", () => {
    expect(formatDataMb(10000)).toBe("10 GB");
    expect(formatDataMb(1000)).toBe("1 GB");
    expect(formatDataMb(500)).toBe("500 MB");
  });

  it("formats byte usage on the same decimal scale", () => {
    expect(formatBytes(10000000000)).toBe("10 GB");
    expect(formatBytes(0)).toBe("0 B");
  });

  it("does not confuse the two scales", () => {
    // 10000 MB and 10000 bytes must never render alike.
    expect(formatDataMb(10000)).not.toBe(formatBytes(10000));
    expect(formatBytes(10000)).toBe("10 KB");
  });

  it("returns null for absent allowances instead of '0 MB'", () => {
    expect(formatDataMb(null)).toBeNull();
    expect(formatDataMb(0)).toBeNull();
  });
});

describe("planAllowance", () => {
  it("reads data_limit_mb for fixed plans", () => {
    expect(planAllowance({ plan_type: "fixed", data_limit_mb: 10000, daily_high_speed_mb: null }))
      .toBe("10 GB");
  });

  it("reads daily_high_speed_mb for daily plans", () => {
    expect(planAllowance({ plan_type: "daily", data_limit_mb: null, daily_high_speed_mb: 1000 }))
      .toBe("1 GB/day");
  });

  it("returns null rather than 'null GB' when the field is absent", () => {
    expect(planAllowance({ plan_type: "fixed", data_limit_mb: null })).toBeNull();
    expect(planAllowance(null)).toBeNull();
  });
});

describe("usageRatio", () => {
  it("reports the remaining fraction", () => {
    expect(usageRatio(5000000000, 10000000000)).toBe(0.5);
    expect(usageRatio(10000000000, 10000000000)).toBe(1);
  });

  it("returns null when totals are unknown, so no bar is drawn", () => {
    expect(usageRatio(100, 0)).toBeNull();
    expect(usageRatio(null, null)).toBeNull();
  });
});
