// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroSearch } from "./hero-search.client";
import { TripQuiz } from "./trip-quiz.client";
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

/**
 * Three countries chosen for their collisions: "ge" is Georgia's ISO2 code AND the first
 * two letters of Germany, and Singapore merely CONTAINS a "g". Catalogue order puts
 * Singapore first on purpose, so a test that passes by accident of ordering fails here.
 */
const AMBIGUOUS = [
  { slug: "singapore", iso2: "SG", name: "Singapore", flagEmoji: "\u{1F1F8}\u{1F1EC}", region: "Asia" },
  { slug: "georgia", iso2: "GE", name: "Georgia", flagEmoji: "\u{1F1EC}\u{1F1EA}", region: "Europe" },
  { slug: "germany", iso2: "DE", name: "Germany", flagEmoji: "\u{1F1E9}\u{1F1EA}", region: "Europe" },
];

describe("hero search", () => {
  /** catalog.json is popularity-sorted, so the box opens on the most-wanted destination. */
  it("starts on the most popular destination", () => {
    render(<HeroSearch countries={COUNTRIES} />);
    expect(screen.getByLabelText(/search destinations/i).value).toBe(COUNTRIES[0].name);
  });

  /** So a tap replaces the default instead of making you delete it character by character. */
  it("selects the whole value on focus", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.click(input);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(COUNTRIES[0].name.length);
  });

  /*
   * The regression guard for the ghost click.
   *
   * The suggestion list is positioned over the hero's country chips. Selecting on
   * pointerdown tore the list out of the DOM while the finger was still down, so at
   * finger-up the browser hit-tested again and delivered the click to the chip
   * underneath — a second navigation that landed after ours and won. Row 1 covers the
   * most popular chip, which is why every pick ended on Saudi Arabia.
   *
   * Asserted as "pointerdown alone changes nothing": as long as that holds, the row is
   * still mounted when the click arrives and consumes it itself.
   */
  it("does not select or navigate on pointerdown alone", async () => {
    render(<HeroSearch countries={COUNTRIES} />);
    const input = screen.getByLabelText(/search destinations/i);
    await userEvent.clear(input);
    await userEvent.type(input, "thai");

    const row = screen.getAllByRole("button", { name: /Thailand/ })[0];
    fireEvent.pointerDown(row);

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /Thailand/ }).length).toBeGreaterThan(0);

    fireEvent.click(row);
    expect(routerMock.push).toHaveBeenCalledWith("/esim/thailand");
  });

  /**
   * The reported bug, as a test: a query that has not narrowed to one country is not a
   * destination. "ge" is both Georgia's ISO2 code and the start of Germany, which is the
   * collision that used to send people typing "germany" to Georgia.
   */
  it("does not navigate while the query still matches several countries", async () => {
    render(<HeroSearch countries={AMBIGUOUS} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.type(input, "ge{Enter}");

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /Germany/ }).length).toBeGreaterThan(0);
  });

  /**
   * Ranking, not catalogue order. The old version kept the catalogue's order, so the first
   * suggestion for "g" was whichever country sat highest in the file — walking the target
   * through Singapore and Georgia on the way to Germany.
   */
  it("ranks a prefix match above a mere substring match", async () => {
    render(<HeroSearch countries={AMBIGUOUS} />);
    const input = screen.getByLabelText(/search destinations/i);

    await userEvent.type(input, "ge");

    // Scoped to the suggestion list — getAllByRole("button") would return the submit
    // button first, which is not a suggestion.
    const rows = within(screen.getByRole("list")).getAllByRole("button");
    expect(rows[0].textContent).toMatch(/Georgia|Germany/);
    expect(rows.map((r) => r.textContent).join(" ")).not.toMatch(/Singapore/);
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

  /** A partial query still navigates when it narrows the catalogue to exactly one. */
  it("navigates on a partial query that matches only one country", async () => {
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
