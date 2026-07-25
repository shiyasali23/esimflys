import { describe, it, expect } from "vitest";
import { approvedContentSlugs, getCountryContent, isCountryContentApproved } from "./index.js";

const FIELDS = [
  "metaTitle",
  "metaDescription",
  "intro",
  "countryContext",
  "networkNotes",
  "connectionDetails",
  "activationNotes",
  "whyEsim",
];

describe("country_content store", () => {
  const slugs = approvedContentSlugs();

  it("has approved content for the priority markets", () => {
    expect(slugs.length).toBeGreaterThanOrEqual(10);
  });

  it("every approved country has all required fields + 4 FAQs", () => {
    for (const slug of slugs) {
      const c = getCountryContent(slug);
      expect(isCountryContentApproved(slug)).toBe(true);
      for (const f of FIELDS) {
        expect(typeof c[f]).toBe("string");
        expect(c[f].length).toBeGreaterThan(0);
        expect(c[f]).not.toContain("&amp;");
      }
      expect(Array.isArray(c.faqs)).toBe(true);
      expect(c.faqs.length).toBe(4);
      for (const q of c.faqs) {
        expect(q.q.length).toBeGreaterThan(0);
        expect(q.a.length).toBeGreaterThan(0);
      }
    }
  });

  it("titles fit ~60 chars with the brand suffix and are unique", () => {
    const titles = new Set();
    const descs = new Set();
    for (const slug of slugs) {
      const c = getCountryContent(slug);
      expect(c.metaTitle.length + " | eSIMFlys".length).toBeLessThanOrEqual(62);
      expect(c.metaDescription.length).toBeGreaterThanOrEqual(110);
      expect(c.metaDescription.length).toBeLessThanOrEqual(165);
      titles.add(c.metaTitle);
      descs.add(c.metaDescription);
    }
    expect(titles.size).toBe(slugs.length);
    expect(descs.size).toBe(slugs.length);
  });

  it("unknown / non-authored slugs are not approved", () => {
    expect(isCountryContentApproved("france")).toBe(false);
    expect(getCountryContent("does-not-exist")).toBeNull();
  });
});
