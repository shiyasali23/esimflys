// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelector } from "./plan-selector.client";
import { useCart } from "@/features/cart/use-cart.client";
import { COUNTRY, PLAN, UNLIMITED_PLAN, PLANS, CART } from "../storefront-fixtures";
import { routerMock } from "../../../../vitest.setup";

/**
 * The buy path — the only place on the storefront where money starts moving.
 *
 * Two shapes share this component and must not be confused: a `fixed` plan has a
 * total allowance, a `daily` plan has a per-day one and no total. Rendering a
 * daily plan as "null GB" is the failure mode this guards.
 *
 * The selector renders TWICE — a sticky mobile bar and a desktop sidebar — so
 * every query here is scoped. An unscoped `getByText` matches both.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(respond) {
  globalThis.fetch = vi.fn(() => Promise.resolve(respond ? respond() : jsonResponse(CART, 200)));
}

const summary = () => screen.getByText(/purchase summary/i).closest("div");
const checkoutButtons = () => screen.getAllByRole("button", { name: /continue to checkout/i });

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useCart.setState({ cart: null, loading: false, error: null });
});

afterEach(() => vi.restoreAllMocks());

describe("which plan starts selected", () => {
  it("honours the catalogue's default rather than just the first plan", () => {
    mockApi();
    // UNLIMITED_PLAN is listed first but PLAN carries isDefaultSelected.
    render(<PlanSelector country={COUNTRY} plans={[UNLIMITED_PLAN, PLAN]} />);

    expect(screen.getByRole("radio", { name: /10 GB/i }).checked).toBe(true);
    expect(screen.getByRole("radio", { name: /unlimited/i }).checked).toBe(false);
  });

  it("falls back to the first plan when none is flagged default", () => {
    mockApi();
    render(
      <PlanSelector
        country={COUNTRY}
        plans={[{ ...UNLIMITED_PLAN, isDefaultSelected: false }, { ...PLAN, isDefaultSelected: false }]}
      />,
    );

    expect(screen.getByRole("radio", { name: /unlimited/i }).checked).toBe(true);
  });

  it("renders nothing rather than crashing when a country has no plans", () => {
    mockApi();
    const { container } = render(<PlanSelector country={COUNTRY} plans={[]} />);
    expect(container.textContent).toBe("");
  });
});

describe("how the two plan shapes are described", () => {
  /** A `daily` plan has no total allowance — "null GB" is the bug this catches. */
  it("labels an unlimited plan by its per-day allowance, not a total", () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={[UNLIMITED_PLAN]} />);

    const option = screen.getByRole("radio", { name: /unlimited/i }).closest("label");
    expect(within(option).getByText("Unlimited")).toBeTruthy();
    expect(within(option).getByText(/2 GB\/day · 7 days/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/null|undefined|NaN/);
  });

  it("labels a fixed plan by its total and validity", () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    const option = screen.getByRole("radio", { name: /10 GB/i }).closest("label");
    expect(within(option).getByText("10 GB")).toBeTruthy();
    expect(within(option).getByText(/valid 30 days/i)).toBeTruthy();
  });

  it("names the country in the fieldset legend, for screen readers", () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);
    expect(screen.getByRole("group", { name: /choose a data plan for Saudi Arabia/i })).toBeTruthy();
  });
});

describe("changing the selection", () => {
  it("updates the summary total to the newly chosen plan", async () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    expect(within(summary()).getByText("$16.99")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: /unlimited/i }));

    expect(within(summary()).getByText("$12.99")).toBeTruthy();
    expect(within(summary()).queryByText("$16.99")).toBeNull();
  });

  /** The price is what the user is about to be charged — it must be announced. */
  it("announces the changing total politely", () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    const live = summary().querySelector("[aria-live='polite']");
    expect(live).toBeTruthy();
    expect(live.textContent).toContain("$16.99");
  });

  it("lists the networks the plan actually runs on", () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);
    expect(within(summary()).getByText("STC 5G")).toBeTruthy();
  });

  it("omits the network row when none is known, rather than showing a blank", () => {
    mockApi();
    render(<PlanSelector country={{ ...COUNTRY, networks: [] }} plans={PLANS} />);
    expect(within(summary()).queryByText(/^networks?$/i)).toBeNull();
  });
});

describe("continuing to checkout", () => {
  it("adds the SELECTED plan, not the default one", async () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(screen.getByRole("radio", { name: /unlimited/i }));
    await userEvent.click(checkoutButtons()[0]);

    const post = globalThis.fetch.mock.calls.find((c) => c[1]?.method === "POST");
    expect(JSON.parse(post[1].body)).toMatchObject({
      product_code: UNLIMITED_PLAN.product_id,
      quantity: 1,
    });
  });

  it("moves to checkout once the item is in the cart", async () => {
    mockApi();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);

    expect(routerMock.push).toHaveBeenCalledWith("/checkout");
  });

  it("does not navigate when the item could not be added", async () => {
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);

    await screen.findByRole("alert");
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  /**
   * `plan_unavailable` means the catalogue changed under the page. Repeating the
   * click cannot help — only a reload re-reads it — so the message says so.
   */
  it("tells the user to refresh when the plan has just been withdrawn", async () => {
    mockApi(() =>
      jsonResponse(
        { error: { code: "plan_unavailable", message: "Plan is not available." } },
        409,
      ),
    );
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);

    expect(await screen.findByText(/just became unavailable\. refresh/i)).toBeTruthy();
  });

  it("re-enables the button after a failure so the user is not stuck", async () => {
    mockApi(() => jsonResponse({ detail: "Server error" }, 500));
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);
    await screen.findByRole("alert");

    for (const button of checkoutButtons()) expect(button.disabled).toBe(false);
  });

  it("disables both checkout buttons while the add is in flight", async () => {
    let release;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => { release = () => resolve(jsonResponse(CART)); }));
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);

    // Both renderings share one state, so neither can be double-submitted.
    for (const button of screen.getAllByRole("button", { name: /adding/i })) {
      expect(button.disabled).toBe(true);
    }
    release();
  });
});
