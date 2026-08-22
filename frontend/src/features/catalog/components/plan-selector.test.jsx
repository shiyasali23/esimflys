// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSelector } from "./plan-selector.client";
import { useCart } from "@/features/cart/use-cart.client";
import { COUNTRY, PLAN, UNLIMITED_PLAN, PLANS } from "../storefront-fixtures";
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
 *
 * Choosing a plan is now a purely local act: there is no server-side cart, so nothing
 * on this screen can fail on a slow or absent backend. `fetch` is stubbed only so that
 * an accidental request would show up as a call rather than a crash.
 */

const summary = () => screen.getByText(/purchase summary/i).closest("div");
const checkoutButtons = () =>
  screen.getAllByRole("button", { name: /continue to checkout|use the cart/i });
const payButton = () => screen.getByRole("button", { name: /proceed to payment|starting/i });
const emailBox = () => screen.getByLabelText(/email address/i);
/** Requests the page makes on its own (the session probe) are not buy traffic. */
const buyCalls = () =>
  globalThis.fetch.mock.calls.filter(([url]) => !String(url).includes("/account/me/"));

/**
 * `signedInAs` also sets the session hint, because that is what a real signed-in browser
 * carries. The component only probes `/account/me/` when the hint is present — a browser
 * that has never signed in has nothing to prefill, and probing anyway cost an authenticated
 * 403 on every country page. Setting the mock without the hint would test a browser state
 * that cannot occur.
 */
function mockSession({ signedInAs = null, order } = {}) {
  if (signedInAs) window.localStorage.setItem("esimflys-session", "1");
  else window.localStorage.removeItem("esimflys-session");
  globalThis.fetch = vi.fn((url, init) => {
    const u = String(url);
    if (u.includes("/account/me/")) {
      return Promise.resolve(
        signedInAs
          ? jsonResponse({ id: "u1", email: signedInAs })
          : jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403),
      );
    }
    if (init?.method === "POST" && u.includes("/checkout/direct/")) {
      return Promise.resolve(order ? order() : jsonResponse(ORDER, 201));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ORDER = { id: "ord-9", order_number: "EF-2026-0009", customer_email: "buyer@example.com" };

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  globalThis.fetch = vi.fn();
  window.sessionStorage.clear();
  useCart.setState({ items: [], hydrated: true });
});

afterEach(() => vi.restoreAllMocks());

describe("which plan starts selected", () => {
  it("honours the catalogue's default rather than just the first plan", () => {
    // UNLIMITED_PLAN is listed first but PLAN carries isDefaultSelected.
    render(<PlanSelector country={COUNTRY} plans={[UNLIMITED_PLAN, PLAN]} />);

    expect(screen.getByRole("radio", { name: /10 GB/i }).checked).toBe(true);
    expect(screen.getByRole("radio", { name: /unlimited/i }).checked).toBe(false);
  });

  /**
   * The grid is sorted for the shopper, so "first in the supplier's array" is not a
   * meaningful default any more. Merchandising picks it: `is_default_selected`, then
   * the `popular` badge, and only then whatever came first.
   */
  it("prefers the popular plan when none is flagged default", () => {
    render(
      <PlanSelector
        country={COUNTRY}
        plans={[
          { ...UNLIMITED_PLAN, isDefaultSelected: false, badge: null },
          { ...PLAN, isDefaultSelected: false, badge: "popular" },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: /10 GB/i }).checked).toBe(true);
  });

  it("falls back to the first plan when nothing is flagged or merchandised", () => {
    render(
      <PlanSelector
        country={COUNTRY}
        plans={[
          { ...UNLIMITED_PLAN, isDefaultSelected: false, badge: null },
          { ...PLAN, isDefaultSelected: false, badge: null },
        ]}
      />,
    );

    expect(screen.getByRole("radio", { name: /unlimited/i }).checked).toBe(true);
  });

  it("renders nothing rather than crashing when a country has no plans", () => {
    const { container } = render(<PlanSelector country={COUNTRY} plans={[]} />);
    expect(container.textContent).toBe("");
  });
});

describe("how the two plan shapes are described", () => {
  /** A `daily` plan has no total allowance — "null GB" is the bug this catches. */
  it("labels an unlimited plan by its per-day allowance, not a total", () => {
    render(<PlanSelector country={COUNTRY} plans={[UNLIMITED_PLAN]} />);

    const option = screen.getByRole("radio", { name: /unlimited/i }).closest("label");
    expect(within(option).getByText("Unlimited")).toBeTruthy();
    expect(within(option).getByText(/7 days/)).toBeTruthy();
    expect(within(option).getByText(/2 GB\/day at full speed/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/null|undefined|NaN/);
  });

  /**
   * The supplier hands Albania over as 10, 20, 5, 50, 3, 1 — no order at all. A
   * shopper matches a trip against a size, so the grid has to climb, with unlimited
   * (a different unit) after the fixed sizes.
   */
  it("climbs by size, with unlimited last", () => {
    const mk = (gb, id) => ({ ...PLAN, product_id: id, data_gb: gb, isDefaultSelected: false, badge: null });
    render(
      <PlanSelector
        country={COUNTRY}
        plans={[mk(10, "a"), mk(3, "b"), mk(50, "c"), { ...UNLIMITED_PLAN, badge: null }, mk(1, "d")]}
      />,
    );

    const shown = screen.getAllByRole("radio").map((r) => r.closest("label").textContent);
    expect(shown.map((t) => /Unlimited/.test(t) ? "U" : t.match(/(\d+) GB/)[1])).toEqual(
      ["1", "3", "10", "50", "U"],
    );
  });

  /**
   * Eight sizes at one glance are only comparable per unit: Albania runs from
   * $0.82/GB at 50 GB to $3.00/GB at 3 GB, and nothing on the card used to say so.
   */
  it("prices each fixed plan per GB so sizes can be compared", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, data_gb: 10, retail_price_usd: 16.99 }]} />);

    const option = screen.getByRole("radio", { name: /10 GB/i }).closest("label");
    expect(within(option).getByText(/\/ GB/)).toBeTruthy();
    expect(option.textContent).toContain("$1.70");
  });

  it("prices an unlimited plan per day, never per GB", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...UNLIMITED_PLAN, validity_days: 10, retail_price_usd: 17.99 }]} />);

    const option = screen.getByRole("radio", { name: /unlimited/i }).closest("label");
    expect(within(option).getByText(/\/ day/)).toBeTruthy();
    expect(option.textContent).not.toMatch(/\/ GB/);
  });

  /** At 1 GB the unit price is just the price again — noise, not information. */
  it("omits the unit price where it would only repeat the price", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, data_gb: 1, retail_price_usd: 7.99 }]} />);

    const option = screen.getByRole("radio", { name: /1 GB/i }).closest("label");
    expect(within(option).queryByText(/\/ GB/)).toBeNull();
  });

  it("labels a fixed plan by its total and validity", () => {
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    const option = screen.getByRole("radio", { name: /10 GB/i }).closest("label");
    expect(within(option).getByText("10 GB")).toBeTruthy();
    expect(within(option).getByText(/30 days/)).toBeTruthy();
  });

  it("names the country in the fieldset legend, for screen readers", () => {
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);
    expect(screen.getByRole("group", { name: /choose a data plan for Saudi Arabia/i })).toBeTruthy();
  });
});

describe("changing the selection", () => {
  it("updates the summary total to the newly chosen plan", async () => {
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    expect(within(summary()).getByText("$16.99")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: /unlimited/i }));

    expect(within(summary()).getByText("$12.99")).toBeTruthy();
    expect(within(summary()).queryByText("$16.99")).toBeNull();
  });

  /** The price is what the user is about to be charged — it must be announced. */
  it("announces the changing total politely", () => {
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    const live = summary().querySelector("[aria-live='polite']");
    expect(live).toBeTruthy();
    expect(live.textContent).toContain("$16.99");
  });

  it("lists the networks the plan actually runs on", () => {
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);
    expect(within(summary()).getByText("STC 5G")).toBeTruthy();
  });

  it("omits the network row when none is known, rather than showing a blank", () => {
    render(<PlanSelector country={{ ...COUNTRY, networks: [] }} plans={PLANS} />);
    expect(within(summary()).queryByText(/^networks?$/i)).toBeNull();
  });
});

describe("continuing to checkout", () => {
  const selection = () => useCart.getState().items;

  it("adds the SELECTED plan, not the default one", async () => {
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(screen.getByRole("radio", { name: /unlimited/i }));
    await userEvent.click(checkoutButtons()[0]);

    expect(selection()).toHaveLength(1);
    expect(selection()[0]).toMatchObject({
      productCode: UNLIMITED_PLAN.product_id,
      quantity: 1,
      countrySlug: COUNTRY.slug,
    });
  });

  /**
   * The catalogue price is carried for one reason: rendering a total on the checkout
   * screen. The server prices every line itself when the order is created, so this
   * figure is never what gets charged.
   */
  it("carries the catalogue price and the country, for the checkout summary", async () => {
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);
    await userEvent.click(checkoutButtons()[0]);

    expect(selection()[0]).toMatchObject({
      usd: PLAN.retail_price_usd,
      countryName: COUNTRY.name,
      displayName: "10 GB",
    });
  });

  /**
   * The whole point of removing the server cart: pressing this button cannot fail on
   * the network, so it cannot strand a shopper who is ready to pay.
   */
  it("reaches checkout without a single buy request", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(checkoutButtons()[0]);

    expect(buyCalls()).toHaveLength(0);
    expect(routerMock.push).toHaveBeenCalledWith("/checkout");
  });

  // The pinned bar and the sidebar link share one selection, so they agree.
  it("adds one line, not two, whichever cart route is taken", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    await userEvent.click(checkoutButtons()[1]);

    expect(selection()).toHaveLength(1);
    expect(selection()[0].quantity).toBe(1);
  });

  /**
   * Coming back for a second country must not silently overwrite the first. Coming back
   * for the SAME plan is a no-op — see the store, which holds one eSIM per line now that
   * checkout has no quantity control to correct a doubled one with.
   */
  it("keeps an earlier selection from another destination", async () => {
    useCart.getState().add({
      productCode: "AL-5GB-30D-V1",
      displayName: "5 GB",
      countryName: "Albania",
      countrySlug: "albania",
      usd: 9.5,
      quantity: 1,
    });
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    await userEvent.click(checkoutButtons()[0]);

    expect(selection().map((i) => i.countrySlug)).toEqual(["albania", COUNTRY.slug]);
  });
});

/**
 * `hotspot_supported` is null for every plan today, and null means UNKNOWN
 * (contract §4, §14.9). Rendering it as "No" denies a feature the plan may have;
 * rendering "Yes" promises one we cannot verify.
 */
describe("hotspot support", () => {
  const hotspotRow = () => within(summary()).getByText(/^hotspot$/i).closest("div");

  it("says unknown when the supplier has not told us", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, hotspotSupported: null }]} />);

    const row = hotspotRow();
    expect(within(row).getByText(/check with your carrier/i)).toBeTruthy();
    expect(row.textContent).not.toMatch(/^Hotspot(No|Not supported)$/);
  });

  it("never renders a null as No", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, hotspotSupported: null }]} />);
    expect(hotspotRow().textContent).not.toMatch(/\bnot supported\b/i);
  });

  it("states support plainly when the supplier confirms it", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, hotspotSupported: true }]} />);
    expect(within(hotspotRow()).getByText("Supported")).toBeTruthy();
  });

  it("states the absence plainly when the supplier denies it", () => {
    render(<PlanSelector country={COUNTRY} plans={[{ ...PLAN, hotspotSupported: false }]} />);
    expect(within(hotspotRow()).getByText("Not supported")).toBeTruthy();
  });

  /** undefined is not the same as false — an absent key is still unknown. */
  it("treats an absent key as unknown too", () => {
    const { hotspotSupported, ...noKey } = PLAN;
    render(<PlanSelector country={COUNTRY} plans={[noKey]} />);
    expect(within(hotspotRow()).getByText(/check with your carrier/i)).toBeTruthy();
  });
});

/**
 * Buying one plan needs neither a cart nor the checkout page: the order is created from
 * this single line and /checkout/payment mounts Stripe off its id. Desktop only — the
 * sidebar that holds this is `hidden lg:block`, because on a phone the same box would
 * push the buy button off screen.
 */
describe("buying straight from the plan page", () => {
  it("creates the order from the selected plan and goes to payment", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={PLANS} />);

    await userEvent.click(screen.getByRole("radio", { name: /unlimited/i }));
    await userEvent.type(await screen.findByLabelText(/email address/i), "buyer@example.com");
    await userEvent.click(payButton());

    await waitFor(() => expect(buyCalls()).toHaveLength(1));
    const [url, init] = buyCalls()[0];
    expect(String(url)).toContain("/checkout/direct/");
    expect(JSON.parse(init.body)).toMatchObject({
      items: [{ product_code: UNLIMITED_PLAN.product_id, quantity: 1 }],
      customer_email: "buyer@example.com",
    });
    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith("/checkout/payment?order=ord-9"),
    );
  });

  /**
   * The plan became an order. Leaving a copy in the basket would offer it for sale a
   * second time the next time the shopper opened checkout.
   */
  it("does not also drop the plan in the cart", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    await userEvent.type(await screen.findByLabelText(/email address/i), "buyer@example.com");
    await userEvent.click(payButton());

    await waitFor(() => expect(routerMock.push).toHaveBeenCalled());
    expect(useCart.getState().items).toEqual([]);
  });

  it("carries an idempotency key, so a lost response cannot become two orders", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    await userEvent.type(await screen.findByLabelText(/email address/i), "buyer@example.com");
    await userEvent.click(payButton());

    await waitFor(() => expect(buyCalls()).toHaveLength(1));
    expect(buyCalls()[0][1].headers["Idempotency-Key"]).toBeTruthy();
  });

  it("will not buy without an address to deliver to", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);
    await screen.findByLabelText(/email address/i);

    await userEvent.click(payButton());

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(buyCalls()).toHaveLength(0);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  /** The probe is an authenticated round-trip; a browser that never signed in must not pay for it. */
  it("does not probe the account API when the browser has never signed in", async () => {
    mockSession();
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);
    await screen.findByLabelText(/email address/i);

    const probes = globalThis.fetch.mock.calls.filter(([url]) =>
      String(url).includes("/account/me/"),
    );
    expect(probes).toHaveLength(0);
  });

  it("asks a signed-in customer for nothing at all", async () => {
    mockSession({ signedInAs: "ada@example.com" });
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    expect(await screen.findByText("ada@example.com")).toBeTruthy();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();

    await userEvent.click(payButton());
    await waitFor(() => expect(buyCalls()).toHaveLength(1));
    expect(JSON.parse(buyCalls()[0][1].body).customer_email).toBe("ada@example.com");
  });

  it("explains a plan withdrawn while the page was open, and stays put", async () => {
    mockSession({
      order: () =>
        jsonResponse({ error: { code: "plan_unavailable", message: "Gone." } }, 409),
    });
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    await userEvent.type(await screen.findByLabelText(/email address/i), "buyer@example.com");
    await userEvent.click(payButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(/just become unavailable/i);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(payButton().disabled).toBe(false);
  });

  // Accounts being unreachable must not stop a guest from buying.
  it("falls back to the email box when the session probe fails", async () => {
    globalThis.fetch = vi.fn((url) =>
      String(url).includes("/account/me/")
        ? Promise.resolve(new Response("Internal Server Error", { status: 500 }))
        : Promise.resolve(jsonResponse(ORDER, 201)),
    );
    render(<PlanSelector country={COUNTRY} plans={[PLAN]} />);

    expect(await screen.findByLabelText(/email address/i)).toBeTruthy();
  });
});
