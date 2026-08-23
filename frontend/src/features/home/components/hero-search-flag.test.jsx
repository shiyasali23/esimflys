// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroSearch } from "@/features/home/components/hero-search.client";
import { COUNTRIES } from "@/features/catalog/storefront-fixtures";
import { routerMock } from "../../../../vitest.setup";

afterEach(() => vi.restoreAllMocks());
const input = () => screen.getByLabelText(/search destinations/i);
const flag = (c) => c.querySelector('[role="img"]');
const icon = (c) => c.querySelector("svg");

describe("hero search flag", () => {
  it("shows the initial destination's flag, not a magnifier", () => {
    const { container } = render(<HeroSearch countries={COUNTRIES} />);
    expect(flag(container).textContent).toBe("🇸🇦");
  });

  /** The flag must not advertise a guess the Search button would not honour. */
  it("stays a magnifier while the query is still ambiguous", async () => {
    const cs = [
      { slug: "georgia", iso2: "GE", name: "Georgia", flagEmoji: "🇬🇪", region: "Europe" },
      { slug: "germany", iso2: "DE", name: "Germany", flagEmoji: "🇩🇪", region: "Europe" },
    ];
    const { container } = render(<HeroSearch countries={cs} />);
    await userEvent.type(input(), "ge");
    expect(flag(container)).toBeNull();
    expect(icon(container)).toBeTruthy();
  });

  it("follows the query to a different country", async () => {
    const { container } = render(<HeroSearch countries={COUNTRIES} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "thai");
    expect(flag(container).textContent).toBe("🇹🇭");
  });

  it("falls back to the magnifier when nothing matches", async () => {
    const { container } = render(<HeroSearch countries={COUNTRIES} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "atlantis");
    expect(flag(container)).toBeNull();
    expect(icon(container)).toBeTruthy();
  });

  it("falls back to the magnifier for an empty box", async () => {
    const { container } = render(<HeroSearch countries={COUNTRIES} />);
    await userEvent.clear(input());
    expect(flag(container)).toBeNull();
    expect(icon(container)).toBeTruthy();
  });

  it("never navigates from an empty box", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "{Enter}");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("shows the EXACT match's flag, not a substring neighbour", async () => {
    const cs = [
      { slug: "romania", iso2: "RO", name: "Romania", flagEmoji: "🇷🇴", region: "Europe" },
      { slug: "oman", iso2: "OM", name: "Oman", flagEmoji: "🇴🇲", region: "Middle East" },
    ];
    const { container } = render(<HeroSearch countries={cs} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "Oman");
    expect(flag(container).textContent).toBe("🇴🇲");
  });

  it("uses the magnifier when the matched country has no flag", async () => {
    const cs = [{ slug: "narnia", iso2: "NA", name: "Narnia", flagEmoji: null, region: "N/A" }];
    const { container } = render(<HeroSearch countries={cs} />);
    await userEvent.clear(input());
    await userEvent.type(input(), "Narnia");
    expect(flag(container)).toBeNull();
    expect(icon(container)).toBeTruthy();
  });

  it("the flag is decorative, not announced twice", () => {
    const { container } = render(<HeroSearch countries={COUNTRIES} />);
    expect(flag(container).closest('[aria-hidden="true"]')).toBeTruthy();
  });
});
