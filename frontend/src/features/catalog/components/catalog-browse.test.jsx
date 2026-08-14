// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DestinationsBrowser } from "./destinations-browser.client";
import { RecentlyViewed } from "./recently-viewed.client";
import { COUNTRY, COUNTRIES } from "../storefront-fixtures";

/**
 * Browsing the catalogue.
 *
 * The search has to accept the two things a traveller actually types — a country
 * name or its two-letter code — and say so when neither matches, rather than
 * silently rendering an empty grid that reads as "we cover nowhere".
 */

afterEach(() => vi.restoreAllMocks());

describe("searching destinations", () => {
  it("lists everything before a query is typed", () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    for (const country of COUNTRIES) {
      expect(screen.getAllByText(country.name).length).toBeGreaterThan(0);
    }
  });

  it("matches on the country name", async () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    await userEvent.type(screen.getByLabelText(/search destinations/i), "thai");

    expect(screen.getAllByText("Thailand").length).toBeGreaterThan(0);
    expect(screen.queryByText("Saudi Arabia")).toBeNull();
  });

  /** "JP", "SA" — a code is what someone types when the name is long. */
  it("matches on the two-letter code", async () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    await userEvent.type(screen.getByLabelText(/search destinations/i), "AE");

    expect(screen.getAllByText("United Arab Emirates").length).toBeGreaterThan(0);
    expect(screen.queryByText("Thailand")).toBeNull();
  });

  it("ignores case and surrounding spaces", async () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    await userEvent.type(screen.getByLabelText(/search destinations/i), "  ICELAND  ");

    expect(screen.getAllByText("Iceland").length).toBeGreaterThan(0);
  });

  it("says nothing matched rather than showing a bare grid", async () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    await userEvent.type(screen.getByLabelText(/search destinations/i), "atlantis");

    expect(screen.getAllByText(/no destinations match your search/i).length).toBeGreaterThan(0);
  });

  it("links each destination to its country page", () => {
    render(<DestinationsBrowser countries={COUNTRIES} />);

    const link = screen.getAllByRole("link", { name: /Saudi Arabia/ })[0];
    expect(link.getAttribute("href")).toBe("/esim/saudi-arabia");
  });

  /**
   * Regional bundles do not exist yet. The redesigned browser filters by region
   * rather than offering a "Regional" product tab, so the honesty message moved to
   * the homepage (`where-travelers-go.client.jsx`). What must stay true here is that
   * this screen never offers a regional bundle it cannot sell.
   */
  it("offers no regional bundle it cannot sell", () => {
    const { container } = render(<DestinationsBrowser countries={COUNTRIES} />);

    expect(screen.queryByRole("tab", { name: /regional/i })).toBeNull();
    expect(container.textContent).not.toMatch(/regional (bundle|plan)/i);
  });
});

describe("recently viewed", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing on a first visit", () => {
    const { container } = render(<RecentlyViewed current={COUNTRY} />);
    expect(container.textContent).toBe("");
  });

  it("remembers a previous country and offers it as a shortcut", () => {
    window.localStorage.setItem(
      "recentCountries",
      JSON.stringify([{ slug: "thailand", name: "Thailand", flagEmoji: "🇹🇭" }]),
    );
    render(<RecentlyViewed current={COUNTRY} />);

    const section = screen.getByText(/recently viewed/i).closest("section");
    expect(within(section).getByRole("link", { name: /Thailand/ }).getAttribute("href")).toBe(
      "/esim/thailand",
    );
  });

  /** The page you are already on is not a useful shortcut off it. */
  it("never lists the country currently being viewed", () => {
    window.localStorage.setItem(
      "recentCountries",
      JSON.stringify([{ slug: "saudi-arabia", name: "Saudi Arabia", flagEmoji: "🇸🇦" }]),
    );
    const { container } = render(<RecentlyViewed current={COUNTRY} />);

    expect(container.textContent).toBe("");
  });

  it("records the current country for next time, most recent first", () => {
    window.localStorage.setItem(
      "recentCountries",
      JSON.stringify([{ slug: "thailand", name: "Thailand", flagEmoji: "🇹🇭" }]),
    );
    render(<RecentlyViewed current={COUNTRY} />);

    const stored = JSON.parse(window.localStorage.getItem("recentCountries"));
    expect(stored[0].slug).toBe("saudi-arabia");
    expect(stored.map((c) => c.slug)).toContain("thailand");
  });

  it("does not accumulate duplicates of the same country", () => {
    window.localStorage.setItem(
      "recentCountries",
      JSON.stringify([
        { slug: "saudi-arabia", name: "Saudi Arabia", flagEmoji: "🇸🇦" },
        { slug: "thailand", name: "Thailand", flagEmoji: "🇹🇭" },
      ]),
    );
    render(<RecentlyViewed current={COUNTRY} />);

    const stored = JSON.parse(window.localStorage.getItem("recentCountries"));
    expect(stored.filter((c) => c.slug === "saudi-arabia")).toHaveLength(1);
  });

  it("keeps the list short enough to stay a shortcut", () => {
    window.localStorage.setItem(
      "recentCountries",
      JSON.stringify(
        Array.from({ length: 12 }, (_, i) => ({ slug: `c${i}`, name: `Country ${i}`, flagEmoji: "🏳️" })),
      ),
    );
    render(<RecentlyViewed current={COUNTRY} />);

    expect(JSON.parse(window.localStorage.getItem("recentCountries")).length).toBeLessThanOrEqual(6);
  });

  /** Corrupt storage is not a reason to break a country page. */
  it("survives unparseable storage", () => {
    window.localStorage.setItem("recentCountries", "{not json");
    expect(() => render(<RecentlyViewed current={COUNTRY} />)).not.toThrow();
  });
});
