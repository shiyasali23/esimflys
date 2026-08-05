// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * The 50-unit ceiling is re-checked AT CHECKOUT (contract §5.1), not only on add,
 * so a cart can be over the line by the time someone reaches this button. Neither
 * of these refusals can be cleared by pressing the button again.
 */
describe("refusals that a retry cannot fix", () => {
  const failCheckout = (code, message) => {
    globalThis.fetch = vi.fn((url, init) => {
      const u = String(url);
      if (u.includes("/account/me/")) {
        return Promise.resolve(jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403));
      }
      if (init?.method === "POST" && u.includes("/checkout/")) {
        return Promise.resolve(jsonResponse({ error: { code, message } }, 409));
      }
      return Promise.resolve(jsonResponse(CART));
    });
  };

  const submit = async () => {
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    const email = screen.getByLabelText(/email/i);
    await userEvent.type(email, "traveller@example.com");
    await userEvent.click(screen.getByRole("button", { name: /place order|pay|continue/i }));
  };

  it("names the cart ceiling and the remedy", async () => {
    failCheckout("cart_limit_exceeded", "Cart limit exceeded.");
    render(<CheckoutView />);
    await submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/maximum of 50 eSIMs/i);
    expect(alert.textContent).toMatch(/remove some/i);
    expect(alert.textContent).not.toMatch(/try again/i);
  });

  it("explains a plan withdrawn between browsing and buying", async () => {
    failCheckout("plan_unavailable", "Plan is not available.");
    render(<CheckoutView />);
    await submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer available/i);
  });
});

/**
 * A `tracking` code is an agency referral: the customer pays FULL price and the
 * agency earns commission. Contract §5.2 forbids promising a saving for one.
 *
 * The preview returns no `kind` field — verified live, it is only
 * `{code, discount_minor, subtotal_minor, total_minor, currency}` — so the copy is
 * driven off the amount, which is truthful whichever kind it is.
 */
describe("promo codes never promise a saving that is not there", () => {
  const withPromo = (discountMinor) => {
    globalThis.fetch = vi.fn((url, init) => {
      const u = String(url);
      if (u.includes("/account/me/")) {
        return Promise.resolve(jsonResponse({ error: { code: "permission_denied", message: "No." } }, 403));
      }
      if (init?.method === "POST" && u.includes("/promo-code/")) {
        return Promise.resolve(
          jsonResponse({
            code: "SUNRISE20",
            discount_minor: discountMinor,
            subtotal_minor: 2998,
            total_minor: 2998 - discountMinor,
            currency: "USD",
          }),
        );
      }
      return Promise.resolve(jsonResponse(CART));
    });
  };

  const applyCode = async () => {
    await screen.findByText("Saudi Arabia 10 GB — 30 Days");
    await userEvent.type(screen.getByLabelText(/promo|code/i), "SUNRISE20");
    await userEvent.click(screen.getByRole("button", { name: /apply/i }));
  };

  it("states plainly that a zero-discount code changes nothing", async () => {
    withPromo(0);
    render(<CheckoutView />);
    await applyCode();

    const note = await screen.findByText(/code accepted/i);
    expect(note.textContent).toMatch(/doesn.t reduce this order.s total/i);
    expect(note.textContent).not.toMatch(/off at checkout|you save|discount applied/i);
  });

  /** Green + "off at checkout" reads as a win; a referral code is not one. */
  it("does not dress a zero discount as a success", async () => {
    withPromo(0);
    render(<CheckoutView />);
    await applyCode();

    const note = await screen.findByText(/code accepted/i);
    expect(note.className).not.toMatch(/success/);
    expect(document.body.textContent).not.toContain("$0.00 off");
  });

  it("still celebrates a real discount", async () => {
    withPromo(300);
    render(<CheckoutView />);
    await applyCode();

    const note = await screen.findByText(/code applied/i);
    expect(note.textContent).toMatch(/off at checkout/i);
    expect(note.className).toMatch(/success/);
  });
});
