import { describe, expect, it } from "vitest";

import { FEATURED_SLUGS, HERO_CHIP_COUNT } from "./featured";
import catalog from "@/data/catalog.json";

/**
 * The hero chips are laid out in a fixed grid — two columns on a phone, three from `md`.
 * That layout only looks right for a count that fills both, and the count is the only
 * thing standing between six tidy chips and a ragged final row.
 */
describe("hero chip count", () => {
  it("fills whole rows in both grid layouts", () => {
    expect(HERO_CHIP_COUNT % 2).toBe(0);
    expect(HERO_CHIP_COUNT % 3).toBe(0);
  });

  it("shows exactly the six countries the hero is meant to lead with", () => {
    expect(FEATURED_SLUGS.slice(0, HERO_CHIP_COUNT)).toEqual([
      "saudi-arabia",
      "malaysia",
      "thailand",
      "singapore",
      "indonesia",
      "maldives",
    ]);
  });

  it("keeps Azerbaijan and Georgia out of the hero", () => {
    // Removed by request. They stay in FEATURED_SLUGS for the "Where travelers go" grid
    // further down the page — only the hero drops them, and it drops them by COUNT, so
    // raising HERO_CHIP_COUNT would silently put them back.
    const hero = FEATURED_SLUGS.slice(0, HERO_CHIP_COUNT);
    expect(hero).not.toContain("azerbaijan");
    expect(hero).not.toContain("georgia");
  });

  it("cannot ask for more chips than the list holds", () => {
    expect(HERO_CHIP_COUNT).toBeLessThanOrEqual(FEATURED_SLUGS.length);
  });

  it("every featured slug exists in the catalogue", () => {
    // A slug with no catalogue entry renders nothing at all — the chip silently vanishes
    // and the grid row goes ragged, which is exactly how Armenia would have failed.
    const known = new Set((catalog.countries ?? catalog).map((c) => c.slug));
    expect(FEATURED_SLUGS.filter((slug) => !known.has(slug))).toEqual([]);
  });
});
