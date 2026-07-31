// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroSearch } from "./hero-search.client";
import { TripQuiz } from "./trip-quiz.client";
import { Testimonials } from "./testimonials.client";
import { WhereTravelersGo } from "./where-travelers-go.client";
import { COUNTRIES } from "@/features/catalog/storefront-fixtures";
import { routerMock } from "../../../../vitest.setup";

/**
 * The interactive parts of the homepage.
 *
 * Search is the primary way someone reaches a country page, so it has to accept
 * both a name and a two-letter code and never navigate somewhere it wasn't asked
 * to. The testimonials carry a standing honesty constraint: they are placeholders
 * until eSIMFlys has real reviews, and must never read as genuine ones.
 */

afterEach(() => vi.restoreAllMocks());

describe("hero search", () => {
  it("starts on a real destination rather than an empty box", () => {
    render(<HeroSearch countries={COUNTRIES} />);
    expect(screen.getByLabelText(/search destinations/i).value).toBe("Saudi Arabia");
  });

  it("suggests matches as the user types", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "thai");

    const options = screen.getAllByRole("button", { name: /Thailand/ });
    expect(options.length).toBeGreaterThan(0);
  });

  it("matches a two-letter code as well as a name", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "AE");

    expect(screen.getAllByRole("button", { name: /United Arab Emirates/ }).length).toBeGreaterThan(0);
  });

  it("goes to the country page when a suggestion is picked", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "thai");
    await userEvent.click(screen.getAllByRole("button", { name: /Thailand/ })[0]);

    expect(routerMock.push).toHaveBeenCalledWith("/esim/thailand");
  });

  /** Typing a full name and pressing enter must not land on a near-match. */
  it("prefers an exact name match over the first suggestion on submit", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "Iceland{Enter}");

    expect(routerMock.push).toHaveBeenCalledWith("/esim/iceland");
  });

  it("falls back to the best suggestion for a partial query", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "icel{Enter}");

    expect(routerMock.push).toHaveBeenCalledWith("/esim/iceland");
  });

  it("says nothing matched instead of navigating somewhere arbitrary", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.clear(input);
    await userEvent.type(input, "atlantis");

    expect(screen.getByText(/no countries match/i)).toBeTruthy();

    await userEvent.type(input, "{Enter}");
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});

describe("trip quiz", () => {
  const answer = async (label) => userEvent.click(screen.getByRole("button", { name: new RegExp(label, "i") }));
  const next = async () => userEvent.click(screen.getByRole("button", { name: /next|see my recommendation/i }));

  it("will not advance until the step is answered", () => {
    render(<TripQuiz />);
    expect(screen.getByRole("button", { name: /next/i }).disabled).toBe(true);
  });

  it("cannot go back from the first step", () => {
    render(<TripQuiz />);
    expect(screen.getByRole("button", { name: /^back$/i }).disabled).toBe(true);
  });

  it("walks all three steps to a recommendation", async () => {
    render(<TripQuiz />);
    expect(screen.getByText(/step 1 of 3/i)).toBeTruthy();

    await answer("Business trip");
    await next();
    expect(screen.getByText(/step 2 of 3/i)).toBeTruthy();

    await answer("Heavy");
    await next();
    expect(screen.getByText(/step 3 of 3/i)).toBeTruthy();

    await answer("1–2 weeks");
    await next();

    expect(screen.getByText(/your recommendation/i)).toBeTruthy();
  });

  /** The suggestion has to reflect the answers, not a fixed string. */
  it("recommends a size that follows the data answer", async () => {
    render(<TripQuiz />);
    await answer("Business trip");
    await next();
    await answer("Light");
    await next();
    await answer("1–7 days");
    await next();

    expect(screen.getByText(/3–5 GB/)).toBeTruthy();
    expect(screen.getByText(/1–7 days/i)).toBeTruthy();
  });

  it("recommends the unlimited tier when that is what was asked for", async () => {
    render(<TripQuiz />);
    await answer("Remote work");
    await next();
    await answer("Unlimited");
    await next();
    await answer("1 month\\+");
    await next();

    expect(screen.getByText(/unlimited daily plan/i)).toBeTruthy();
  });

  it("can be restarted from the beginning", async () => {
    render(<TripQuiz />);
    await answer("Backpacking");
    await next();
    await answer("Medium");
    await next();
    await answer("3–4 weeks");
    await next();

    await userEvent.click(screen.getByRole("button", { name: /start over/i }));

    expect(screen.getByText(/step 1 of 3/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /next/i }).disabled).toBe(true);
  });

  it("sends the user somewhere they can actually buy", async () => {
    render(<TripQuiz />);
    await answer("Vacation & sightseeing");
    await next();
    await answer("Medium");
    await next();
    await answer("1–2 weeks");
    await next();

    expect(screen.getByRole("link", { name: /browse destinations/i }).getAttribute("href")).toBe(
      "/destinations",
    );
  });
});

/**
 * These reviews are placeholders for layout. The project's standing rule is that
 * no fabricated or borrowed trust signal may be presented as real, so each of
 * these guards a way that could quietly stop being true.
 */
describe("testimonials stay honest placeholders", () => {
  it("says on the page that they are samples to be replaced", () => {
    render(<Testimonials />);
    expect(screen.getByText(/sample reviews shown for layout/i)).toBeTruthy();
  });

  it("marks none of them verified", () => {
    render(<Testimonials />);
    expect(screen.queryByText(/^verified$/i)).toBeNull();
  });

  it("claims no aggregate rating or review count", () => {
    const { container } = render(<Testimonials />);
    // e.g. "4.3 out of 5", "109 reviews", "250K+ travelers"
    expect(container.textContent).not.toMatch(/\d[.,]\d\s*(\/|out of)\s*5/i);
    expect(container.textContent).not.toMatch(/\d+\s*(reviews|ratings)\b/i);
    expect(container.textContent).not.toMatch(/\d[\d,.]*\s*[k+]\s*(travel|customer|user)/i);
  });

  /** Review/AggregateRating markup would put the placeholder into search results. */
  it("emits no review structured data", () => {
    const { container } = render(<Testimonials />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      expect(script.textContent).not.toMatch(/AggregateRating|"@type"\s*:\s*"Review"/);
    }
    expect(scripts.length).toBe(0);
  });

  it("renders the quotes as quotations, not as bare claims", () => {
    const { container } = render(<Testimonials />);
    expect(container.querySelectorAll("blockquote").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("figcaption").length).toBeGreaterThan(0);
  });
});

describe("where travellers go", () => {
  it("links each destination to its country page", () => {
    render(<WhereTravelersGo destinations={COUNTRIES} />);

    const link = screen.getAllByRole("link", { name: /Saudi Arabia/ })[0];
    expect(link.getAttribute("href")).toBe("/esim/saudi-arabia");
  });

  it("badges only the countries the catalogue flagged", () => {
    render(<WhereTravelersGo destinations={COUNTRIES} />);

    const saudi = screen.getAllByRole("link", { name: /Saudi Arabia/ })[0];
    expect(within(saudi).getByText(/popular/i)).toBeTruthy();

    const iceland = screen.getAllByRole("link", { name: /Iceland/ })[0];
    expect(within(iceland).queryByText(/popular|best value/i)).toBeNull();
  });

  /**
   * `priceFrom` is null for a country with no active plans. Printing "from $0.00"
   * there would advertise a price that cannot be bought.
   */
  it("shows no price for a country with nothing on sale", () => {
    render(<WhereTravelersGo destinations={COUNTRIES} />);

    const iceland = screen.getAllByRole("link", { name: /Iceland/ })[0];
    expect(within(iceland).queryByText(/\$/)).toBeNull();
    expect(iceland.textContent).not.toMatch(/\$0\.00|from \$0/);
  });
});
