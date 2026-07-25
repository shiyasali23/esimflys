import { describe, it, expect } from "vitest";
import catalog from "./catalog.json";

const { countries, plans, meta } = catalog;
const active = countries.filter((c) => c.isActive).slice().sort((a, b) => a.sortOrder - b.sortOrder);

describe("catalog data (Excel → JSON contract)", () => {
  it("has 68 countries, all active, 18 popular", () => {
    expect(countries.length).toBe(68);
    expect(active.length).toBe(68);
    expect(countries.filter((c) => c.isPopular).length).toBe(18);
  });

  it("orders the first 4 (hero) by sortOrder: SA, AE, TH, ID", () => {
    expect(active.slice(0, 4).map((c) => c.iso2)).toEqual(["SA", "AE", "TH", "ID"]);
  });

  it("first 8 (grid) add MY, SG, MV, TR", () => {
    expect(active.slice(0, 8).map((c) => c.iso2).slice(4)).toEqual(["MY", "SG", "MV", "TR"]);
  });

  it("only allows valid homepageBadge values (popular x4, best_value x2)", () => {
    const allowed = new Set(["popular", "best_value", null]);
    for (const c of countries) expect(allowed.has(c.homepageBadge)).toBe(true);
    expect(countries.filter((c) => c.homepageBadge === "popular").length).toBe(4);
    expect(countries.filter((c) => c.homepageBadge === "best_value").length).toBe(2);
  });

  it("keeps networks as clean arrays (fixes concatenation)", () => {
    for (const c of countries) expect(Array.isArray(c.networks)).toBe(true);
    const au = countries.find((c) => c.iso2 === "AU");
    expect(au.networks.join(", ")).toBe("Optus 5G, Telstra 5G");
  });

  it("has no orphan plans and no TUR / 3-letter codes", () => {
    const slugs = new Set(countries.map((c) => c.slug));
    for (const p of plans) {
      expect(slugs.has(p.countrySlug)).toBe(true);
      expect(p.country_code).not.toBe("TUR");
      expect(p.country_code.length).toBe(2);
    }
  });

  it("Turkey is TR with a slug and plans", () => {
    const tr = countries.find((c) => c.iso2 === "TR");
    expect(tr.slug).toBe("turkey");
    expect(tr.planCount).toBeGreaterThan(0);
  });

  it("normalizes plan booleans / arrays and keeps timezone null", () => {
    for (const p of plans) {
      expect(typeof p.isDefaultSelected).toBe("boolean");
      expect(typeof p.topupSupported).toBe("boolean");
      expect(Array.isArray(p.networkNames)).toBe(true);
    }
    for (const c of countries) expect(c.timezone).toBeNull();
  });

  it("retains server-only fields on raw plans for toClientPlan to strip", () => {
    for (const f of meta.serverOnlyFields) {
      expect(plans.some((p) => f in p)).toBe(true);
    }
  });

  it("has consistent meta counts and no duplicate slugs/iso2", () => {
    expect(meta.countryCount).toBe(active.length);
    expect(meta.planCount).toBe(plans.length);
    expect(new Set(countries.map((c) => c.slug)).size).toBe(countries.length);
    expect(new Set(countries.map((c) => c.iso2)).size).toBe(countries.length);
  });
});
