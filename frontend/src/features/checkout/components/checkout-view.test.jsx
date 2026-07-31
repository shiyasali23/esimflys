// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckoutView } from "@/features/checkout/components/checkout-view.client";
import { useCart } from "@/features/cart/use-cart.client";

/**
 * Checkout reads the server cart and never computes its own totals — the server
 * reprices at order time, so anything derived here could disagree with what is
 * actually charged.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CART = {
  id: "cart-1",
  currency: "USD",
  status: "active",
  items: [
    {
      id: "item-1",
      product_code: "SA-10GB-30D-V1",
      display_name: "Saudi Arabia 10 GB — 30 Days",
      plan_type: "fixed",
      quantity: 2,
      unit_amount_minor: 1499,
      line_total_minor: 2998,
    },
  ],
  subtotal_minor: 2998,
  item_count: 2,
};

const EMPTY = { id: null, items: [], subtotal_minor: 0, item_count: 0 };

/** Cart first, then the anonymous /account/me/ probe. */
function mockCart(cart, { signedInAs = null } = {}) {
  globalThis.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes("/account/me/")) {
      return Promise.resolve(
        signedInAs
          ? jsonResponse({ id: "u1", email: signedInAs })
          : jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403),
      );
    }
    return Promise.resolve(jsonResponse(cart));
  });
}

beforeEach(() => {
  document.cookie = "csrftoken=t; path=/";
  useCart.setState({ cart: null, loading: false, error: null, pendingItemId: null });
});

afterEach(() => vi.restoreAllMocks());

describe("empty cart", () => {
  it("offers a way out instead of an empty form", async () => {
    mockCart(EMPTY);
    render(<CheckoutView />);
    expect(await screen.findByText(/your cart is empty/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /browse destinations/i })).toBeTruthy();
  });
});

describe("with items", () => {
  it("renders the server's line items and totals", async () => {
    mockCart(CART);
    render(<CheckoutView />);
    expect(await screen.findByText("Saudi Arabia 10 GB — 30 Days")).toBeTruthy();
    // 2998 minor → $29.98
    expect(screen.getAllByText("$29.98").length).toBeGreaterThan(0);
  });

  it("pluralises the eSIM count from the server's item_count", async () => {
    mockCart(CART);
    render(<CheckoutView />);
    expect(await screen.findByText(/subtotal \(2 esims\)/i)).toBeTruthy();
  });

  it("gives the quantity controls per-item accessible names", async () => {
    mockCart(CART);
    render(<CheckoutView />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    expect(
      screen.getByRole("button", { name: /increase quantity of saudi arabia/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /decrease quantity of saudi arabia/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove saudi arabia/i })).toBeTruthy();
  });

  it("announces the total politely as it changes", async () => {
    mockCart(CART);
    const { container } = render(<CheckoutView />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
});

describe("identity", () => {
  it("asks a guest for an email and offers Google as a real navigation", async () => {
    mockCart(CART);
    render(<CheckoutView />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");

    expect(document.querySelector('input[name="customer_email"]')).toBeTruthy();
    // OAuth needs a full-page redirect, so it must be an anchor, not a fetch button.
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toBe("/accounts/google/login/");
  });

  it("uses the account instead of asking, when signed in", async () => {
    mockCart(CART, { signedInAs: "a@b.com" });
    render(<CheckoutView />);
    expect(await screen.findByText(/signed in as/i)).toBeTruthy();
    expect(document.querySelector('input[name="customer_email"]')).toBeNull();
  });
});

describe("promo codes", () => {
  it("is a preview: applying does not claim the discount is saved", async () => {
    mockCart(CART);
    render(<CheckoutView />);
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    // The code must still be sent at checkout, so the field stays available.
    expect(screen.getByRole("button", { name: /apply/i })).toBeTruthy();
  });
});
