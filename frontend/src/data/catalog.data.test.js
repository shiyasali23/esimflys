import { describe, it, expect } from "vitest";
import catalog from "./catalog.json";

/**
 * The baked catalogue contract.
 *
 * `catalog.json` is generated from the LIVE API by `scripts/generate-catalog.mjs`
 * and is the storefront's only source of catalogue data — there is no runtime
 * fetch. If the generator regresses, every country page ships wrong, so the shape
 * and the merchandising invariants are pinned here.
 */

const { countries, plans, meta } = catalog;
const active = countries.filter((c) => c.isActive).slice().sort((a, b) => a.sortOrder - b.sortOrder);

describe("catalog data (API → JSON contract)", () => {
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

  it("has no orphan plans", () => {
    const slugs = new Set(countries.map((c) => c.slug));
    for (const p of plans) expect(slugs.has(p.countrySlug)).toBe(true);
  });

  it("uses 2-letter ISO codes, never 3-letter ones", () => {
    for (const c of countries) expect(c.iso2).toMatch(/^[A-Z]{2}$/);
    expect(countries.find((c) => c.iso2 === "TUR")).toBeUndefined();
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

  /**
   * The inverse of the old assertion, and a stronger guarantee.
   *
   * The previous Excel-derived file CARRIED wholesale prices and margin, relying on
   * `toClientPlan` to strip them before render — one missed call site away from
   * leaking commercially sensitive data into a public bundle. The generator now
   * reads the PUBLIC API, which never returns them, and refuses to write the file
   * if it finds any. They cannot leak because they are not there.
   */
  it("contains no wholesale or margin data at all", () => {
    const serialised = JSON.stringify(catalog);
    for (const field of [
      "wholesale_amount_minor",
      "margin_minor",
      "wholesale_price_usd",
      "competitor_ref_price",
      "competitor_ref_brand",
      "supplier_package_code",
    ]) {
      expect(serialised).not.toContain(field);
    }
  });

  /** Only active plans are published, so a paused row must never appear. */
  it("holds active plans only", () => {
    for (const p of plans) expect(p.status).toBe("active");
  });

  it("has consistent meta counts and no duplicate slugs/iso2", () => {
    expect(meta.countryCount).toBe(active.length);
    expect(meta.planCount).toBe(plans.length);
    expect(new Set(countries.map((c) => c.slug)).size).toBe(countries.length);
    expect(new Set(countries.map((c) => c.iso2)).size).toBe(countries.length);
  });

  it("records where it came from, so a stale file is diagnosable", () => {
    expect(meta.generatedBy).toBe("scripts/generate-catalog.mjs");
    expect(meta.source).toMatch(/\/api\/v1\/catalog\//);
  });
});
